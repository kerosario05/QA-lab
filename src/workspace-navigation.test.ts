import {beforeEach,describe,expect,it} from 'vitest';
import {loadWorkspaceNavigation,saveWorkspaceNavigation} from './workspace-navigation';
import type {ActiveRun,View} from './types';
describe('workspace navigation across reload',()=>{
  beforeEach(()=>sessionStorage.clear());
  for (const view of ['dashboard','execute','grabacion','ejecuciones','configuracion','usuarios','diseno'] as View[]) {
    it(`restores ${view}`,()=>{
      saveWorkspaceNavigation(sessionStorage,'one',{view,liveRun:null,checklistIdentity:null,executionDeepLink:null});
      expect(loadWorkspaceNavigation(sessionStorage,'one').view).toBe(view);
    });
  }
  it('restores the same live job without persisting scenario input values',()=>{
    saveWorkspaceNavigation(sessionStorage,'one',{view:'live',liveRun:{id:'job-a',jobId:'job-a',project:'Example',total:2,activeScenarios:[{id:'case',title:'test',steps:['private input'],index:1,total:1}]} as ActiveRun,checklistIdentity:null,executionDeepLink:null});
    expect(loadWorkspaceNavigation(sessionStorage,'one').liveRun?.jobId).toBe('job-a');
    expect(sessionStorage.getItem('qalab:navigation:v1:one')).not.toContain('private input');
    expect(loadWorkspaceNavigation(sessionStorage,'two').view).toBe('dashboard');
  });
  it('keeps checklist and selected execution identities',()=>{
    saveWorkspaceNavigation(sessionStorage,'one',{view:'checklist',liveRun:null,checklistIdentity:'TEST-1',checklistJobId:'job',checklistScenarioIds:['case'],executionDeepLink:'launch'});
    expect(loadWorkspaceNavigation(sessionStorage,'one')).toMatchObject({view:'checklist',checklistIdentity:'TEST-1',checklistJobId:'job',executionDeepLink:'launch'});
  });
  it('falls back safely for corruption or a live screen without a job',()=>{
    sessionStorage.setItem('qalab:navigation:v1:one','{');
    expect(loadWorkspaceNavigation(sessionStorage,'one').view).toBe('dashboard');
    sessionStorage.setItem('qalab:navigation:v1:one','{"view":"live"}');
    expect(loadWorkspaceNavigation(sessionStorage,'one').view).toBe('dashboard');
  });
});
