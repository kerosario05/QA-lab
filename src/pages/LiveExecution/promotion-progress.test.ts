import {describe, expect, it} from 'vitest';
import {getPromotionProgress,formatPromotionLog,getPromotionLogCounters} from './promotion-progress';
describe('promotion progress', () => {
  it('shows readable stages and step outcomes in live logs and preserves failure details',()=>{
    expect(formatPromotionLog('[scenario-preview] stdout: [promotion-progress] stage=playwright_collection status=started')).toContain('Comprobar que Playwright reconoce el spec · En curso');
    expect(formatPromotionLog('[promoted-step] stepIndex=4 phase=failed failureClass=target_not_found')).toBe('[Promoción · Spec] Paso 4 · Fallido failureClass=target_not_found');
    expect(formatPromotionLog('[evidence] step 1 passed')).toBe('[evidence] step 1 passed');
  });
  it('counts promotion outcomes independently of discovery, without double counting replayed logs',()=>{
    const rows=[
      {msg:'[promoted-step] stepIndex=104 phase=passed'},
      {msg:'[promotion-progress] stage=spec_execution status=started'},
      {msg:'[promoted-step] stepIndex=1 phase=start'},
      {msg:'[promoted-step] stepIndex=1 phase=passed'},
      {msg:'[promoted-step] stepIndex=1 phase=passed'},
      {msg:'[promoted-step] stepIndex=3 phase=failed'},
    ];
    expect(getPromotionLogCounters(rows)).toEqual({active:true,current:3,completed:2,passed:1,failed:1});
    expect(getPromotionLogCounters([...rows,{msg:'[promotion-progress] stage=spec_execution status=started'}]).completed).toBe(0);
    expect(getPromotionLogCounters([...rows,{msg:'{"type":"case_started"}'}]).active).toBe(false);
  });
  it('keeps outcomes while the next gate runs', () => {
    const rows = getPromotionProgress([
      {msg:'[promotion-progress] stage=typescript status=started'},
      {msg:'[promotion-progress] stage=typescript status=passed'},
      {msg:'[promotion-progress] stage=playwright_collection status=failed'},
    ]);
    expect(rows.map(row => row.status)).toEqual(['passed','failed']);
  });
  it('clears prior scenario gates and ignores unrelated logs', () => {
    expect(getPromotionProgress([
      {msg:'[promotion-progress] stage=typescript status=passed'},
      {msg:'{"type":"case_started","caseId":"next"}'},
      {msg:'[spec-candidate-runtime] ready'},
    ])).toEqual([]);
  });
});
