import assert from 'node:assert/strict';
import test from 'node:test';
import { UiThemeSchema } from '../shared/contracts';
import { YEAR_DROPDOWN_MATRIX } from '../tooling/year-dropdown-pilot.mjs';
import { TOPBAR_DATES_MATRIX } from '../tooling/topbar-dates-pilot.mjs';
import { CONTEXT_PICKER_MATRIX } from '../tooling/context-picker-pilot.mjs';
import { UPDATE_STATUS_MATRIX } from '../tooling/update-status-pilot.mjs';
import { PUBLISH_ASSOCIATION_MATRIX } from '../tooling/publish-association-pilot.mjs';

for (const [name, matrix] of Object.entries({
  yearDropdown: YEAR_DROPDOWN_MATRIX, topbarDates: TOPBAR_DATES_MATRIX,
  contextPicker: CONTEXT_PICKER_MATRIX, updateStatus: UPDATE_STATUS_MATRIX,
  publishAssociation: PUBLISH_ASSOCIATION_MATRIX,
})) {
  test(`${name}: installed acceptance selects only current application themes`, () => {
    for (const { theme } of matrix) assert.ok(UiThemeSchema.safeParse(theme).success, `Theme ${theme} is no longer selectable`);
  });
}
