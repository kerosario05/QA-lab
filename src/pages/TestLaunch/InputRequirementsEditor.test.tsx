import { describe, expect, it, vi } from 'vitest';
import {
  addEditableRequirement,
  cloneEditableRequirements,
  persistDraftRequirements,
  validateEditableRequirements,
} from './InputRequirementsEditor';

describe('InputRequirementsEditor', () => {
  it('creates an editable draft without mutating loaded requirements', () => {
    const loaded = [{ key: 'account.email', label: 'Email', controlType: 'email', required: true }];
    const draft = cloneEditableRequirements(loaded);
    draft[0].label = 'Updated';
    expect(loaded[0].label).toBe('Email');
  });

  it('adds a valid editable row without changing the original list', () => {
    const original = [{ key: 'account.email', controlType: 'email' }];
    const draft = addEditableRequirement(original);
    expect(draft).toHaveLength(2);
    expect(original).toHaveLength(1);
    expect(draft[1]).toMatchObject({ key: '', controlType: 'text' });
  });

  it('blocks empty and duplicate normalized keys', () => {
    expect(validateEditableRequirements([{ key: ' ', controlType: 'text' }]).valid).toBe(false);
    expect(validateEditableRequirements([
      { key: ' Account.Email ', controlType: 'text' },
      { key: 'account.email', controlType: 'email' },
    ]).valid).toBe(false);
  });

  it('persists the exact validated draft, including an empty list', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const requirements = [{ key: 'account.role', label: 'Role', controlType: 'select', required: false, sensitive: true, allowedValues: ['admin'] }];
    await persistDraftRequirements('project-a', 22, requirements, save);
    await persistDraftRequirements('project-a', 22, [], save);
    expect(save).toHaveBeenNthCalledWith(1, 'project-a', 22, requirements);
    expect(save).toHaveBeenNthCalledWith(2, 'project-a', 22, []);
  });
});
