# Bundled offline dictation components

Workbench uses SenseVoiceSmall INT8 ONNX, Silero VAD and sherpa-onnx-node 1.13.8.
The original model names, authors and separate license texts are retained here.

- SenseVoiceSmall: Alibaba Group / FunAudioLLM (QwenAudio).
  https://huggingface.co/FunAudioLLM/SenseVoiceSmall
- ONNX conversion: csukuangfj / next-gen Kaldi.
  Revision 2365baeacb507f821a0c8120fcee3d484dba7a07:
  https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17
  Its LICENSE points to FunASR's separate model license; source-code MIT is not substituted for the weight license.
- Silero VAD: Silero Team.
  https://github.com/snakers4/silero-vad
  Model revision fba88cd2e921609e7675c3aaf51e0b9b295da4bc:
  https://huggingface.co/csukuangfj/vad
- sherpa-onnx: next-gen Kaldi team, Apache-2.0.
  https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8
- ONNX Runtime: Microsoft, MIT.
  The Windows native package reports ONNX Runtime 1.28.2.
  https://github.com/microsoft/onnxruntime
- The recognition segmentation approach is adapted from DeepSeek Harness rc.2 (MIT), Copyright (c) 2026 DeepSeek.
  https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2

Model file hashes and immutable download URLs are recorded in the sibling manifest.json.
License snapshots were collected on 2026-10-19. These notices accompany every installer.
