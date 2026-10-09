#!/usr/bin/env python3
"""Reproduce the reviewed Chrome runtime manifest without installing/executing it.
Input: Google's exact HTTPS .deb already downloaded to a temporary path.
Output: JSON on stdout. GNU ar and Python standard library only; no extraction.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile

VERSION = '154.0.8037.97'
PACKAGE_SHA256 = 'a4edbe95e9b01db6c9b97d7a1323121eda18362b5620df06abac1b59bee80053'
URL = 'https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_154.0.8037.97-1_amd64.deb'

def main():
    path = pathlib.Path(sys.argv[1]).resolve()
    if not path.is_file() or path.stat().st_size > 250_000_000:
        raise ValueError('PACKAGE_INPUT_INVALID')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != PACKAGE_SHA256:
        raise ValueError('PACKAGE_SHA256_MISMATCH')
    control_bytes = subprocess.run(['ar', 'p', str(path), 'control.tar.xz'], check=True, stdout=subprocess.PIPE).stdout
    with tarfile.open(fileobj=io.BytesIO(control_bytes), mode='r:xz') as archive:
        metadata = archive.extractfile('./control').read().decode('utf-8')
    fields = dict(line.split(': ', 1) for line in metadata.splitlines() if ': ' in line and not line.startswith(' '))
    if (fields.get('Package'), fields.get('Version'), fields.get('Architecture')) != ('google-chrome-stable', VERSION + '-1', 'amd64'):
        raise ValueError('PACKAGE_METADATA_MISMATCH')
    process = subprocess.Popen(['ar', 'p', str(path), 'data.tar.xz'], stdout=subprocess.PIPE)
    entries, seen = [], set()
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|xz') as archive:
            for member in archive:
                name = member.name.removeprefix('./').rstrip('/')
                prefix = 'opt/google/chrome/'
                if not name.startswith(prefix):
                    continue
                relative = name[len(prefix):]
                if not relative or relative in seen or any(part in ('', '.', '..') for part in relative.split('/')):
                    raise ValueError('RUNTIME_PATH_INVALID')
                seen.add(relative)
                item = {'path': relative}
                if member.isdir():
                    item['type'] = 'directory'
                elif member.isfile():
                    item.update(type='file', size=member.size, sha256=hashlib.file_digest(archive.extractfile(member), 'sha256').hexdigest())
                elif member.issym():
                    item.update(type='symlink', target=member.linkname)
                else:
                    raise ValueError('RUNTIME_TYPE_UNSUPPORTED')
                entries.append(item)
        if process.wait() != 0:
            raise ValueError('PACKAGE_READ_FAILED')
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.kill()
            process.wait()
    if not {'chrome', 'google-chrome'}.issubset(seen):
        raise ValueError('RUNTIME_INCOMPLETE')
    document = {'schema': 1, 'version': VERSION, 'package': {'url': URL, 'sha256': PACKAGE_SHA256, 'version': VERSION + '-1', 'architecture': 'amd64', 'authentication': 'Google official HTTPS; no APT signature claim'}, 'entries': sorted(entries, key=lambda item: item['path'])}
    sys.stdout.buffer.write((json.dumps(document, indent=2, ensure_ascii=True) + '\n').encode('utf-8'))

if __name__ == '__main__':
    main()
