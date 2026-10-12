import { useState } from 'react';
import { DraftsList } from './DraftsList';
import { DraftWorkspace } from './DraftWorkspace';
import { NewDraftForm } from './NewDraftForm';

/**
 * "Diseño de pruebas": generate manual test cases from Jira stories with AI,
 * edit them, and publish the selected ones to TestRail and to a Jira sub-task.
 * Drafts are stored by the engine, so work survives reloads and can be resumed.
 */
type Screen = { kind: 'list' } | { kind: 'new'; projectSlug?: string } | { kind: 'draft'; draftId: string };

export function TestDesign() {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  if (screen.kind === 'new') {
    return (
      <NewDraftForm
        initialProjectSlug={screen.projectSlug}
        onCancel={() => setScreen({ kind: 'list' })}
        onCreated={(draft) => setScreen({ kind: 'draft', draftId: draft.id })}
      />
    );
  }

  if (screen.kind === 'draft') {
    return <DraftWorkspace key={screen.draftId} draftId={screen.draftId} onBack={() => setScreen({ kind: 'list' })} />;
  }

  return (
    <DraftsList
      onOpen={(draftId) => setScreen({ kind: 'draft', draftId })}
      onNew={(projectSlug) => setScreen({ kind: 'new', projectSlug })}
    />
  );
}
