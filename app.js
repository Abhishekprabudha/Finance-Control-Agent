const DATA_FILES = {
  financeEvents: 'data/finance_events.json',
  journalRules: 'data/journal_rules.json',
  journalEntries: 'data/journal_entries.json',
  closeTasks: 'data/close_tasks.json',
  reconciliationRecords: 'data/reconciliation_records.json',
  revenueCases: 'data/revenue_leakage_cases.json',
  cfoMetrics: 'data/cfo_metrics.json',
  auditTrail: 'data/audit_trail.json',
  scenarios: 'data/scenarios.json'
};

const screens = [
  ['executive','Executive Mission Control'],
  ['agents','Agent Command Center'],
  ['journal','Journal Entry Workbench'],
  ['close','Close Mission Control'],
  ['recon','Payment & Recon Cockpit'],
  ['revenue','Revenue Assurance Radar'],
  ['cfo','CFO Performance Cockpit'],
  ['governance','Governance & Audit'],
  ['rollout','Business Case & 90-Day Rollout']
];

const AGENTS = [
  {id:'je', icon:'↗', name:'Journal Entry Agent', kpi:'80% fewer manual JEs', autonomy:'Autonomous + human-in-loop', domain:'R2R · Journals', metricKey:'manual_journals'},
  {id:'close', icon:'⏱', name:'Financial Close Agent', kpi:'60% reduction in days-to-close', autonomy:'Human-on-loop', domain:'Close orchestration', metricKey:'days_to_close'},
  {id:'icgl', icon:'⇄', name:'IC & GL Ops Agent', kpi:'95% GL health target', autonomy:'Human-on-loop', domain:'IC · GL health', metricKey:'recon_stp_pct'},
  {id:'recon', icon:'≋', name:'Payment & Reconciliation Agent', kpi:'95%+ STP reconciliation', autonomy:'Autonomous exceptions', domain:'Payments · Bank · GL', metricKey:'recon_stp_pct'},
  {id:'rev', icon:'◈', name:'Revenue Assurance Agent', kpi:'Leakage recovered and prevented', autonomy:'Human-in-loop on recovery', domain:'O2C · Revenue', metricKey:'leakage_detected_inr'},
  {id:'cfo', icon:'▣', name:'CFO Performance Agent', kpi:'Same-day variance narrative', autonomy:'Decision support', domain:'FP&A · Forecast', metricKey:'audit_readiness_pct'},
  {id:'gov', icon:'◇', name:'Governance Agent', kpi:'100% traceable decisions', autonomy:'Policy guardrails', domain:'Controls · Audit', metricKey:'audit_readiness_pct'}
];

const eventAgentMap = {
  trip_completed:'je', driver_payout:'je', refund_issued:'je', trip_cancelled:'je', surge_pricing:'je', incentive_accrual:'je', gst_output_tax:'je', tds_withholding:'je',
  close_blocker:'close', audit_evidence:'gov', gl_subledger_tieout:'icgl', intercompany_recharge:'icgl', fx_translation:'icgl',
  payment_gateway_settlement:'recon', bank_statement_credit:'recon',
  revenue_leakage:'rev', billing_mismatch:'rev', usage_capture_gap:'rev'
};

const state = {
  data: {},
  currentScreen: location.hash?.replace('#','') || 'executive',
  liveEvents: [],
  activity: [],
  timer: null,
  nextEventIndex: 0,
  demoMode: true,
  activeScenario: null,
  cfoNarrative: '',
  pendingApprovals: [],
  agents: {},
  metrics: {},
  initialized: false
};

function money(n){
  const val = Number(n || 0);
  if(Math.abs(val) >= 10000000) return '₹' + (val/10000000).toFixed(1) + 'Cr';
  if(Math.abs(val) >= 100000) return '₹' + (val/100000).toFixed(1) + 'L';
  return '₹' + val.toLocaleString('en-IN',{maximumFractionDigits:0});
}
function pct(n){ return `${Math.round(Number(n || 0))}%`; }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function nowIso(){ return new Date().toISOString(); }
function safeText(v){ return String(v ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function getById(id){ return document.getElementById(id); }

async function boot(){
  renderNav();
  setTitle();
  const loaded = await Promise.all(Object.entries(DATA_FILES).map(async ([key,path]) => {
    const res = await fetch(path);
    if(!res.ok) throw new Error(`Could not load ${path}`);
    return [key, await res.json()];
  }));
  state.data = Object.fromEntries(loaded);
  hydrateState();
  attachGlobalHandlers();
  state.initialized = true;
  render();
  startSimulation();
  toast('Mission Control online: synthetic Uber India FinOps events are streaming.');
}

function hydrateState(){
  const saved = localStorage.getItem('uberFinopsState');
  if(saved){
    try{
      const parsed = JSON.parse(saved);
      state.liveEvents = parsed.liveEvents || [];
      state.activity = parsed.activity || [];
      state.nextEventIndex = parsed.nextEventIndex || 0;
      state.metrics = parsed.metrics || structuredClone(state.data.cfoMetrics.current);
      state.demoMode = parsed.demoMode ?? true;
      state.cfoNarrative = parsed.cfoNarrative || buildCfoNarrative();
      state.pendingApprovals = parsed.pendingApprovals || [];
      state.data.auditTrail = parsed.auditTrail || state.data.auditTrail;
      state.data.journalEntries = parsed.journalEntries || state.data.journalEntries;
      state.data.reconciliationRecords = parsed.reconciliationRecords || state.data.reconciliationRecords;
    }catch(e){
      console.warn('Ignoring saved state', e);
      state.metrics = structuredClone(state.data.cfoMetrics.current);
      state.cfoNarrative = buildCfoNarrative();
    }
  } else {
    state.metrics = structuredClone(state.data.cfoMetrics.current);
    state.cfoNarrative = buildCfoNarrative();
  }
  AGENTS.forEach((agent, index) => {
    state.agents[agent.id] = {
      status: index === 0 ? 'Investigating' : 'Monitoring',
      confidence: Number((0.84 + (index % 4) * 0.03).toFixed(2)),
      impact: [2800000, 5200000, 1700000, 4400000, 7600000, 2300000, 0][index],
      progress: [66,72,58,81,63,74,88][index],
      currentAction: agent.id === 'je' ? 'Classifying trip revenue and driver payout events' : 'Monitoring finance control signals',
      nextStep: agent.id === 'gov' ? 'Trace decisions to evidence pack' : 'Continue live event processing'
    };
  });
  getById('demo-toggle').checked = state.demoMode;
  updateDemoCaption();
}

function persist(){
  if(!state.initialized) return;
  localStorage.setItem('uberFinopsState', JSON.stringify({
    liveEvents: state.liveEvents.slice(0,40),
    activity: state.activity.slice(0,60),
    nextEventIndex: state.nextEventIndex,
    metrics: state.metrics,
    demoMode: state.demoMode,
    cfoNarrative: state.cfoNarrative,
    pendingApprovals: state.pendingApprovals,
    auditTrail: state.data.auditTrail,
    journalEntries: state.data.journalEntries,
    reconciliationRecords: state.data.reconciliationRecords
  }));
}

function renderNav(){
  const nav = getById('nav');
  nav.innerHTML = screens.map(([id,label]) => `<button data-screen="${id}" class="${state.currentScreen===id?'active':''}">${label}</button>`).join('');
  nav.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    state.currentScreen = btn.dataset.screen;
    location.hash = state.currentScreen;
    setTitle();
    renderNav();
    render();
  }));
}

function setTitle(){
  const match = screens.find(([id]) => id === state.currentScreen) || screens[0];
  getById('screen-title').textContent = match[1];
}

function attachGlobalHandlers(){
  getById('demo-toggle').addEventListener('change', e => {
    state.demoMode = e.target.checked;
    updateDemoCaption();
    persist();
    if(state.demoMode) startSimulation(); else stopSimulation();
    toast(state.demoMode ? 'Demo Mode resumed: live synthetic events are streaming.' : 'Demo Mode paused: current state preserved in localStorage.');
  });
  getById('reset-state').addEventListener('click', () => {
    localStorage.removeItem('uberFinopsState');
    location.reload();
  });
  document.querySelectorAll('[data-scenario]').forEach(btn => {
    btn.addEventListener('click', () => runScenario(btn.dataset.scenario));
  });
  getById('generate-narrative').addEventListener('click', () => {
    state.cfoNarrative = buildCfoNarrative(true);
    addAudit({agent:'CFO Performance Agent', decision:'Generated CFO variance narrative', autonomy_mode:'Human-on-loop', confidence:.91, financial_impact_inr: state.metrics.leakage_detected_inr || 0, policy_guardrail:'Narrative evidence links'});
    render(); persist(); toast('CFO narrative refreshed with current live KPI signals.');
  });
  window.addEventListener('hashchange', () => {
    state.currentScreen = location.hash.replace('#','') || 'executive';
    setTitle(); renderNav(); render();
  });
}

function updateDemoCaption(){
  getById('demo-caption').textContent = state.demoMode ? 'Live simulation running' : 'Simulation paused';
}

function startSimulation(){
  if(state.timer || !state.demoMode || !state.data.financeEvents) return;
  const tick = () => {
    if(!state.demoMode) return;
    processNextEvent('live');
    state.timer = setTimeout(tick, 2000 + Math.random()*2000);
  };
  state.timer = setTimeout(tick, 900);
}
function stopSimulation(){
  if(state.timer) clearTimeout(state.timer);
  state.timer = null;
}

function processNextEvent(source='live', forcedEventType=null){
  const events = state.data.financeEvents;
  let event = events[state.nextEventIndex % events.length];
  state.nextEventIndex += 1;
  if(forcedEventType){
    const matching = events.filter(e => e.event_type === forcedEventType);
    if(matching.length) event = matching[Math.floor(Math.random()*matching.length)];
  }
  processEvent({...event, runtime_id:`${event.event_id}-${Date.now()}`, source});
}

function processEvent(event){
  const agentId = eventAgentMap[event.event_type] || 'gov';
  const agentDef = AGENTS.find(a => a.id === agentId);
  const autoComplete = !event.requires_approval && event.confidence >= 0.88;
  const material = event.requires_approval || event.risk_level === 'Critical';
  const action = inferAction(event, agentDef);
  const activity = {
    id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
    agent: agentDef.name,
    status: material ? 'Awaiting Approval' : autoComplete ? 'Completed' : 'Investigating',
    action,
    event
  };
  state.liveEvents.unshift(event);
  state.liveEvents = state.liveEvents.slice(0,28);
  state.activity.unshift(activity);
  state.activity = state.activity.slice(0,45);
  updateAgentLifecycle(agentId, event, action, material, autoComplete);
  updateMetrics(event, autoComplete);
  if(agentId === 'je') generateRuntimeJE(event, material, autoComplete);
  if(agentId === 'recon') mutateRecon(event, autoComplete);
  if(agentId === 'rev') mutateRevenue(event);
  addAudit({
    agent: agentDef.name,
    source_event_id: event.event_id,
    decision: action,
    autonomy_mode: material ? 'Human-in-loop' : autoComplete ? 'Autonomous' : 'Human-on-loop',
    confidence: event.confidence,
    financial_impact_inr: event.amount_inr,
    policy_guardrail: guardrailFor(event),
    approval_status: material ? 'Pending' : 'Not required',
    evidence_refs: [event.recon_key, event.trip_batch_id, ...(event.policy_tags || [])]
  });
  if(material) state.pendingApprovals.unshift({event, agent: agentDef.name, action});
  render(); persist();
}

function inferAction(event, agent){
  const map = {
    trip_completed:'Classified trip revenue to GL and validated GST signal',
    driver_payout:'Created driver payout accrual and checked cohort variance',
    refund_issued:'Matched refund to original trip and contra-revenue policy',
    trip_cancelled:'Classified cancellation fee and reviewed refund liability',
    surge_pricing:'Validated surge multiplier and revenue uplift posting',
    incentive_accrual:'Created incentive accrual with cohort policy check',
    gst_output_tax:'Validated GST output liability and state-code evidence',
    tds_withholding:'Validated TDS withholding and payable tie-out',
    payment_gateway_settlement:'Triangulated gateway, bank and GL clearing records',
    bank_statement_credit:'Matched bank credit against gateway settlement batch',
    gl_subledger_tieout:'Reconciled sub-ledger to GL and scored aged open items',
    intercompany_recharge:'Matched IC recharge, counterparty and elimination evidence',
    fx_translation:'Calculated FX remeasurement and routed treasury approval',
    revenue_leakage:'Detected revenue leakage and ranked recovery by value',
    billing_mismatch:'Flagged contract-to-invoice mismatch with recovery estimate',
    usage_capture_gap:'Detected missing usage events before billing close',
    close_blocker:'Detected close blocker, assigned owner and SLA escalation',
    audit_evidence:'Created reproducible evidence pack with trace hash'
  };
  return map[event.event_type] || `${agent.name} processed finance control event`;
}

function guardrailFor(event){
  if(['intercompany_recharge','fx_translation'].includes(event.event_type)) return 'Materiality + controller approval';
  if(['gst_output_tax','tds_withholding'].includes(event.event_type)) return 'GST/TDS compliance validation';
  if(['payment_gateway_settlement','bank_statement_credit'].includes(event.event_type)) return 'Payment match confidence threshold';
  if(['revenue_leakage','billing_mismatch','usage_capture_gap'].includes(event.event_type)) return 'Revenue completeness control';
  if(event.event_type === 'close_blocker') return 'Close SLA and evidence pack control';
  return 'CoA, duplicate and materiality policy';
}

function updateAgentLifecycle(agentId, event, action, material, autoComplete){
  const ag = state.agents[agentId];
  if(!ag) return;
  ag.status = 'Investigating';
  ag.currentAction = action;
  ag.confidence = event.confidence;
  ag.impact = event.amount_inr;
  ag.progress = clamp(ag.progress + (autoComplete ? 7 : 4), 10, 99);
  ag.nextStep = material ? 'Waiting for finance controller approval' : autoComplete ? 'Action completed and logged' : 'Gathering supporting evidence';
  setTimeout(() => {
    if(!state.agents[agentId]) return;
    state.agents[agentId].status = material ? 'Awaiting Approval' : 'Acting';
    render();
  }, 650);
  setTimeout(() => {
    if(!state.agents[agentId]) return;
    if(!material) state.agents[agentId].status = 'Completed';
    render();
  }, 1350);
  setTimeout(() => {
    if(!state.agents[agentId]) return;
    if(state.agents[agentId].status === 'Completed') state.agents[agentId].status = 'Monitoring';
    render();
  }, 3200);
}

function updateMetrics(event, autoComplete){
  if(['trip_completed','driver_payout','refund_issued','surge_pricing','incentive_accrual','gst_output_tax','tds_withholding'].includes(event.event_type)){
    state.metrics.manual_journals = Math.max(120, (state.metrics.manual_journals || 0) - (autoComplete ? 4 : 1));
  }
  if(['payment_gateway_settlement','bank_statement_credit'].includes(event.event_type)){
    state.metrics.recon_stp_pct = clamp((state.metrics.recon_stp_pct || 0) + (autoComplete ? .35 : .08), 50, 98.6);
    if(!autoComplete) state.metrics.open_exceptions = (state.metrics.open_exceptions || 0) + 1;
  }
  if(['revenue_leakage','billing_mismatch','usage_capture_gap'].includes(event.event_type)){
    state.metrics.leakage_detected_inr = (state.metrics.leakage_detected_inr || 0) + Math.round(event.amount_inr * .42);
    state.metrics.open_exceptions = (state.metrics.open_exceptions || 0) + 1;
  }
  if(event.event_type === 'close_blocker'){
    state.metrics.open_exceptions = (state.metrics.open_exceptions || 0) + 1;
    state.metrics.days_to_close = clamp((state.metrics.days_to_close || 5.1) + .05, 3.1, 8.5);
  }
  if(event.event_type === 'audit_evidence' || autoComplete){
    state.metrics.audit_readiness_pct = clamp((state.metrics.audit_readiness_pct || 0) + .18, 55, 99);
  }
  if(['gl_subledger_tieout','audit_evidence'].includes(event.event_type)){
    state.metrics.open_exceptions = Math.max(0, (state.metrics.open_exceptions || 0) - 1);
  }
}

function generateRuntimeJE(event, material, autoComplete){
  const rule = state.data.journalRules.find(r => r.event_type === event.event_type) || state.data.journalRules[0];
  const je = {
    je_id:`JE-LIVE-${Date.now().toString().slice(-8)}`,
    source_event_id:event.event_id,
    created_at:nowIso(),
    entity:event.entity,
    city:event.city,
    rule_id:rule.rule_id,
    narrative:`${rule.name} | ${event.product_line} | ${event.city} | ${event.trip_batch_id}`,
    debit:{gl:rule.debit_gl, amount_inr:event.amount_inr},
    credit:{gl:rule.credit_gl, amount_inr:event.amount_inr},
    validation_results:[
      {check:'CoA mapping', result:'Passed'},
      {check:'Duplicate JE test', result:event.confidence > .84 ? 'Passed' : 'Review'},
      {check:'Materiality policy', result:material ? 'Approval required' : 'Passed'},
      {check:'GST/TDS linkage', result:['gst_output_tax','tds_withholding'].includes(event.event_type) ? 'Evidence attached' : 'Not applicable'}
    ],
    confidence:event.confidence,
    risk_level:event.risk_level,
    status:autoComplete ? 'Posted' : material ? 'Awaiting Approval' : 'Draft',
    approver:autoComplete ? null : 'Finance Controller India',
    evidence_refs:[event.recon_key,event.trip_batch_id,`LIVE-EV-${Date.now()}`]
  };
  state.data.journalEntries.unshift(je);
  state.data.journalEntries = state.data.journalEntries.slice(0,60);
}

function mutateRecon(event, autoComplete){
  const rec = state.data.reconciliationRecords.find(r => r.payment_rail === event.payment_rail) || state.data.reconciliationRecords[0];
  if(!rec) return;
  rec.confidence = clamp((event.confidence + rec.confidence)/2 + (autoComplete ? .05 : -.03), .55, .995);
  rec.status = rec.confidence > .91 ? 'Auto-matched' : 'Exception';
  rec.root_cause = rec.status === 'Exception' ? 'Live settlement variance detected by agent' : 'Auto-cleared by live agent';
}

function mutateRevenue(event){
  if(!['revenue_leakage','billing_mismatch','usage_capture_gap'].includes(event.event_type)) return;
  state.data.revenueCases.unshift({
    case_id:`RA-LIVE-${Date.now().toString().slice(-7)}`,
    case_type:event.event_type === 'billing_mismatch' ? 'Contract-to-invoice mismatch' : event.event_type === 'usage_capture_gap' ? 'Usage capture gap' : 'Missing billing event',
    city:event.city,
    product_line:event.product_line,
    entity:event.entity,
    financial_impact_inr:event.amount_inr,
    risk_score:Math.round(event.confidence*100),
    detected_at:nowIso(),
    status:'Owner assigned',
    owner:'Revenue Accounting',
    sla_hours_remaining:24,
    root_cause:event.description,
    recommended_action:'Create recovery invoice and attach evidence to close pack',
    evidence_refs:[event.recon_key,event.trip_batch_id]
  });
  state.data.revenueCases.sort((a,b)=>b.financial_impact_inr-a.financial_impact_inr);
  state.data.revenueCases = state.data.revenueCases.slice(0,40);
}

function addAudit(partial){
  const record = {
    audit_id:`AUD-LIVE-${Date.now()}-${Math.floor(Math.random()*999)}`,
    timestamp:nowIso(),
    agent:partial.agent || 'Governance Agent',
    source_event_id:partial.source_event_id || 'MANUAL-ACTION',
    decision:partial.decision || 'Decision recorded',
    autonomy_mode:partial.autonomy_mode || 'Human-on-loop',
    confidence:partial.confidence || .9,
    financial_impact_inr:partial.financial_impact_inr || 0,
    policy_guardrail:partial.policy_guardrail || 'Controlled autonomy matrix',
    approval_status:partial.approval_status || 'Not required',
    evidence_refs:partial.evidence_refs || ['UI-ACTION','LOCAL-STATE'],
    trace_hash:`trace-${Math.random().toString(16).slice(2,14)}`
  };
  state.data.auditTrail.unshift(record);
  state.data.auditTrail = state.data.auditTrail.slice(0,120);
}

function runScenario(name){
  const scenario = state.data.scenarios.find(s => s.name === name) || state.data.scenarios[0];
  state.activeScenario = scenario;
  scenario.script.forEach((step, index) => {
    setTimeout(() => {
      const eventType = scenario.event_types[index % scenario.event_types.length];
      processNextEvent(`scenario:${scenario.name}`, eventType);
      state.activity.unshift({
        id:`SCN-${Date.now()}-${index}`,
        at:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        agent:'Scenario Replay Engine',
        status:'Completed',
        action:step,
        event:{headline:scenario.name, amount_inr:0, risk_level:'Medium', confidence:.93, source_system:'Scenario Replay Engine'}
      });
      applyScenarioDelta(scenario, index === scenario.script.length - 1);
      render(); persist();
    }, index * 1200);
  });
  toast(`Scenario replay started: ${scenario.name}`);
}

function applyScenarioDelta(scenario, finalStep=false){
  const divisor = scenario.script.length || 1;
  Object.entries(scenario.kpi_delta || {}).forEach(([key,val]) => {
    if(typeof state.metrics[key] !== 'number') state.metrics[key] = 0;
    state.metrics[key] += val / divisor;
    if(key.includes('pct')) state.metrics[key] = clamp(state.metrics[key], 0, 100);
    if(key === 'days_to_close') state.metrics[key] = clamp(state.metrics[key], 2.5, 8.5);
    if(key === 'manual_journals' || key === 'open_exceptions') state.metrics[key] = Math.max(0, state.metrics[key]);
  });
  if(finalStep){
    addAudit({agent:'Governance Agent', decision:`Scenario completed: ${scenario.name}`, autonomy_mode:'Human-on-loop', confidence:.94, policy_guardrail:'Scenario replay evidence', evidence_refs:[scenario.scenario_id,'SIMULATION-LOG']});
    toast(`${scenario.name} completed: KPI impact and audit evidence updated.`);
  }
}

function buildCfoNarrative(dynamic=false){
  const m = state.metrics && Object.keys(state.metrics).length ? state.metrics : state.data.cfoMetrics?.current || {days_to_close:5.1, manual_journals:448, recon_stp_pct:93, leakage_detected_inr:12850000, audit_readiness_pct:88, open_exceptions:54};
  const variance = state.data.cfoMetrics?.forecast?.variance_to_budget_pct ?? -2.8;
  const city = state.data.cfoMetrics?.city_product_variance?.find(x => x.variance_pct < 0) || {city:'Delhi NCR', product_line:'Auto', variance_pct:-8.9, driver_cohort:'New drivers 0-30d'};
  const action = state.data.cfoMetrics?.recommended_actions?.[0]?.action || 'move incentive review into daily control room';
  const prefix = dynamic ? 'Live CFO readout: ' : '';
  return `${prefix}June MTD finance signals show close compression to ${Number(m.days_to_close).toFixed(1)} days, ${Math.round(m.manual_journals)} manual journals remaining, reconciliation STP at ${Number(m.recon_stp_pct).toFixed(1)}%, and ${money(m.leakage_detected_inr)} of leakage detected or prevented. Forecast remains ${Math.abs(variance)}% below budget, led by ${city.city} ${city.product_line} variance of ${city.variance_pct}%, concentrated in ${city.driver_cohort}. Recommended action: ${action}, with controller-visible evidence and policy guardrails attached.`;
}

function metricCards(){
  const b = state.data.cfoMetrics.baseline;
  const m = state.metrics;
  const cards = [
    ['Days-to-close reduction', `${Math.max(0, Math.round((1 - m.days_to_close / b.days_to_close)*100))}%`, `From ${b.days_to_close} days to ${Number(m.days_to_close).toFixed(1)} days`, false],
    ['Manual JEs avoided', Math.max(0, Math.round(b.manual_journals - m.manual_journals)).toLocaleString('en-IN'), `${Math.round(m.manual_journals)} still require human touch`, false],
    ['Straight-through reconciliation', `${Number(m.recon_stp_pct).toFixed(1)}%`, 'Target: 95%+ exception-only operations', false],
    ['Revenue leakage detected', money(m.leakage_detected_inr), 'Ranked by financial impact and SLA', false],
    ['Audit readiness score', `${Number(m.audit_readiness_pct).toFixed(1)}%`, 'Evidence packs continuously assembled', false],
    ['Open exceptions', Math.round(m.open_exceptions), 'Material items routed to owners', m.open_exceptions > b.open_exceptions]
  ];
  return cards.map(([label,value,delta,negative]) => `<article class="card metric ${negative?'negative':''}"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${delta}</div></article>`).join('');
}

function render(){
  if(!state.initialized) return;
  const app = getById('app');
  const renderers = {executive:renderExecutive, agents:renderAgents, journal:renderJournal, close:renderClose, recon:renderRecon, revenue:renderRevenue, cfo:renderCFO, governance:renderGovernance, rollout:renderRollout};
  app.innerHTML = (renderers[state.currentScreen] || renderExecutive)();
  attachScreenHandlers();
}

function renderExecutive(){
  return `
    <section class="hero">
      <div class="eyebrow">Autonomous finance operating layer</div>
      <h1>AIonOS Agentic FinOps Mission Control for Uber</h1>
      <p>One governed layer across SAP / Oracle, billing, payment rails, Hyperion and finance data platforms — sensing, deciding and acting across journals, close, reconciliation, revenue assurance, CFO reporting and audit.</p>
      <div class="hero-row">
        <span class="pill"><i></i>Live events every 2–4 seconds</span>
        <span class="pill"><i></i>Human-in-loop for material actions</span>
        <span class="pill"><i></i>Every action writes audit JSON</span>
        <span class="pill"><i></i>No ERP replacement</span>
      </div>
    </section>
    <section class="grid cols-6">${metricCards()}</section>
    <section class="scenario-grid">${renderScenarioCards()}</section>
    <section class="grid cols-2">
      <article class="card">
        <div class="section-head"><div><h3>Live finance event stream</h3><p>Trip events, payouts, refunds, taxes, payment settlements, GL tie-outs and leakage signals arriving from synthetic Uber India systems.</p></div><span class="tag green">Streaming</span></div>
        <div class="feed">${renderEventFeed()}</div>
      </article>
      <article class="card">
        <div class="section-head"><div><h3>Agent activity feed</h3><p>Agents move from monitoring to investigation, action, approval and completion under governed autonomy rules.</p></div><span class="tag purple">Traceable</span></div>
        <div class="feed">${renderActivityFeed()}</div>
      </article>
    </section>`;
}

function renderScenarioCards(){
  return state.data.scenarios.map(s => `
    <article class="scenario-card">
      <h4>${safeText(s.name)}</h4>
      <p>${safeText(s.description)}</p>
      <div class="mini-stat"><span>Replay</span><strong>${s.duration_seconds}s script</strong></div>
      <button class="ghost-button scenario-run" data-scenario="${safeText(s.name)}">Run scenario</button>
    </article>`).join('');
}

function renderEventFeed(limit=12){
  const list = state.liveEvents.length ? state.liveEvents.slice(0,limit) : state.data.financeEvents.slice(0,limit);
  return list.map(e => `
    <div class="feed-item">
      <strong>${safeText(e.headline)} · ${money(e.amount_inr)}</strong>
      <span>${safeText(e.city)} · ${safeText(e.product_line)} · ${safeText(e.source_system)} · ${safeText(e.entity)}</span>
      <div class="meta"><b class="tag ${e.risk_level==='Critical'||e.risk_level==='High'?'red':e.risk_level==='Medium'?'amber':'green'}">${safeText(e.risk_level)}</b><b class="tag">${safeText(e.payment_rail || 'ERP')}</b><b class="tag purple">${Math.round((e.confidence||0)*100)}% confidence</b></div>
    </div>`).join('');
}

function renderActivityFeed(limit=14){
  const list = state.activity.length ? state.activity.slice(0,limit) : [{at:'Now',agent:'Mission Control',status:'Monitoring',action:'Waiting for first live finance event',event:{amount_inr:0,risk_level:'Low',confidence:.99,headline:'Baseline'}}];
  return list.map(a => `
    <div class="feed-item">
      <strong><span class="status-dot ${a.status==='Awaiting Approval'?'warn':a.status==='Completed'?'':'blue'}"></span>${safeText(a.agent)} · ${safeText(a.status)}</strong>
      <span>${safeText(a.action)}</span>
      <div class="meta"><b class="tag">${safeText(a.at)}</b><b class="tag green">${money(a.event?.amount_inr || 0)}</b><b class="tag purple">${Math.round((a.event?.confidence||.9)*100)}%</b></div>
    </div>`).join('');
}

function renderAgents(){
  return `
    <section class="hero"><div class="eyebrow">Command center</div><h1>Seven finance agents operating as one governed FinOps pod</h1><p>Each card shows current action, confidence, financial impact and next step. Material decisions pause for approval; routine actions complete autonomously and write evidence.</p></section>
    <section class="grid cols-3">${AGENTS.map(renderAgentCard).join('')}</section>`;
}

function renderAgentCard(agent){
  const ag = state.agents[agent.id];
  const dotClass = ag.status === 'Awaiting Approval' ? 'warn' : ag.status === 'Investigating' ? 'blue' : '';
  return `<article class="card agent-card">
    <div class="agent-top"><div class="agent-icon">${agent.icon}</div><span class="agent-state"><span class="status-dot ${dotClass}"></span>${safeText(ag.status)}</span></div>
    <div><h3>${safeText(agent.name)}</h3><p>${safeText(agent.domain)} · ${safeText(agent.kpi)}</p></div>
    <div class="progress"><span style="width:${ag.progress}%"></span></div>
    <div class="kv">
      <div><span>Current action</span><strong title="${safeText(ag.currentAction)}">${safeText(ag.currentAction)}</strong></div>
      <div><span>Confidence</span><strong>${Math.round(ag.confidence*100)}%</strong></div>
      <div><span>Financial impact</span><strong>${money(ag.impact)}</strong></div>
      <div><span>Next step</span><strong title="${safeText(ag.nextStep)}">${safeText(ag.nextStep)}</strong></div>
    </div>
  </article>`;
}

function latestJE(){ return state.data.journalEntries[0]; }
function renderJournal(){
  const je = latestJE();
  const pending = state.data.journalEntries.find(j => j.status === 'Awaiting Approval' || j.status === 'Validation Hold' || j.status === 'Draft');
  return `
    <section class="hero"><div class="eyebrow">Journal Entry Automation</div><h1>Turn millions of finance events into controlled postings</h1><p>Trip events, driver payouts, refunds, cancellations, surge pricing, incentives, GST/TDS and intercompany entries flow through CoA validation, duplicate detection, policy checks and evidence creation.</p></section>
    <section class="grid cols-2">
      <article class="card"><div class="section-head"><div><h3>Incoming finance events</h3><p>Live source events currently being classified into GL and journal logic.</p></div><span class="tag green">Target: 80% fewer manual JEs</span></div><div class="feed">${renderEventFeed(8)}</div></article>
      <article class="card"><div class="section-head"><div><h3>Generated journal entry</h3><p>${safeText(je.narrative)}</p></div><span class="tag ${je.status==='Posted'?'green':je.status==='Awaiting Approval'?'amber':'red'}">${safeText(je.status)}</span></div>${renderJEPreview(je)}<div class="hero-row"><button class="action-button" id="approve-je" ${pending?'':'disabled'}>Approve JE</button><button class="ghost-button" id="export-je">Export JE Evidence JSON</button></div></article>
    </section>
    <section class="grid cols-2">
      <article class="card"><div class="section-head"><div><h3>Validation results</h3><p>CoA rules, duplicate detection, materiality policy, GST/TDS and evidence linkage.</p></div></div><div class="check-list">${je.validation_results.map(v=>`<div class="check ${v.result.includes('Review')||v.result.includes('Approval')?'review':''}"><b>${v.result.includes('Passed')||v.result.includes('Evidence')?'✓':'!'}</b><div><strong>${safeText(v.check)}</strong><p>${safeText(v.result)}</p></div></div>`).join('')}</div></article>
      <article class="card"><div class="section-head"><div><h3>Approval workflow</h3><p>High-value or non-standard postings are held for finance controller action.</p></div><span class="tag amber">${state.pendingApprovals.length} pending</span></div>${renderApprovalQueue()}</article>
    </section>
    <section class="card"><div class="section-head"><div><h3>Recent journal entries</h3><p>Generated and routed entries remain reproducible from JSON with policy guardrail and evidence references.</p></div></div>${journalTable()}</section>`;
}

function renderJEPreview(je){
  return `<div class="entry-preview">
    <div class="entry-line"><span>JE ID</span><strong>${safeText(je.je_id)}</strong></div>
    <div class="entry-line"><span>Entity</span><strong>${safeText(je.entity)}</strong></div>
    <div class="entry-line"><span>Debit</span><strong>${safeText(je.debit.gl)} · ${money(je.debit.amount_inr)}</strong></div>
    <div class="entry-line"><span>Credit</span><strong>${safeText(je.credit.gl)} · ${money(je.credit.amount_inr)}</strong></div>
    <div class="entry-line"><span>Confidence</span><strong>${Math.round(je.confidence*100)}%</strong></div>
    <div class="entry-line"><span>Evidence</span><strong>${je.evidence_refs.map(safeText).join(' · ')}</strong></div>
  </div>`;
}
function renderApprovalQueue(){
  const pending = state.data.journalEntries.filter(j => j.status === 'Awaiting Approval' || j.status === 'Validation Hold' || j.status === 'Draft').slice(0,5);
  if(!pending.length) return '<p>No JE approvals are waiting. Low-risk postings are being auto-posted with audit evidence.</p>';
  return `<div class="feed">${pending.map(j=>`<div class="feed-item"><strong>${safeText(j.je_id)} · ${money(j.debit.amount_inr)}</strong><span>${safeText(j.narrative)}</span><div class="meta"><b class="tag amber">${safeText(j.status)}</b><b class="tag">${safeText(j.approver || 'Controller')}</b><b class="tag purple">${Math.round(j.confidence*100)}%</b></div></div>`).join('')}</div>`;
}
function journalTable(){
  return `<div class="table-wrap"><table><thead><tr><th>JE</th><th>Entity</th><th>Narrative</th><th>Debit</th><th>Credit</th><th>Status</th><th>Confidence</th></tr></thead><tbody>${state.data.journalEntries.slice(0,12).map(j=>`<tr><td>${safeText(j.je_id)}</td><td>${safeText(j.entity)}</td><td>${safeText(j.narrative)}</td><td>${safeText(j.debit.gl)}<br>${money(j.debit.amount_inr)}</td><td>${safeText(j.credit.gl)}<br>${money(j.credit.amount_inr)}</td><td><span class="tag ${j.status==='Posted'?'green':j.status==='Awaiting Approval'?'amber':'red'}">${safeText(j.status)}</span></td><td>${Math.round(j.confidence*100)}%</td></tr>`).join('')}</tbody></table></div>`;
}

function renderClose(){
  const byEntity = groupBy(state.data.closeTasks, 'entity');
  const readiness = Object.entries(byEntity).map(([entity,tasks]) => ({entity, pct: Math.round(tasks.reduce((s,t)=>s+t.progress_pct,0)/tasks.length), blockers: tasks.filter(t=>t.status==='At Risk').length}));
  const blockers = state.data.closeTasks.filter(t => t.status === 'At Risk').slice(0,8);
  return `
    <section class="hero"><div class="eyebrow">Financial Close Orchestration</div><h1>Compress close by parallelizing the right work</h1><p>The Close Agent turns month-end from a static checklist into an intelligent command sequence: detect blockers, assign owners, track SLA and assemble CFO-ready evidence packs.</p></section>
    <section class="grid cols-4">${readiness.map(r=>`<article class="card metric"><div class="label">${safeText(r.entity)}</div><div class="value">${r.pct}%</div><div class="delta">${r.blockers} blockers · CFO sign-off ${r.pct>84?'ready':'building'}</div></article>`).join('')}</section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Close checklist and SLA risk</h3><p>Entity-wise close progress with owners and AI next action.</p></div><span class="tag green">Target: 60% faster close</span></div>${closeTable()}</article><article class="card"><div class="section-head"><div><h3>Blockers and owners</h3><p>Material blockers are escalated with owner, SLA and evidence status.</p></div></div><div class="feed">${blockers.map(t=>`<div class="feed-item"><strong>${safeText(t.task)} · ${safeText(t.entity)}</strong><span>${safeText(t.blocker)} · Owner: ${safeText(t.owner)}</span><div class="meta"><b class="tag red">${safeText(t.sla_risk)} SLA risk</b><b class="tag">${safeText(t.evidence_status)}</b><b class="tag purple">${safeText(t.ai_next_action)}</b></div></div>`).join('')}</div></article></section>
    <section class="card"><div class="section-head"><div><h3>AI-generated close summary</h3><p>CFO sign-off readiness narrated from close progress, blockers, recon and evidence.</p></div></div><p class="narrative">${closeNarrative(readiness, blockers)}</p></section>`;
}
function closeTable(){
  return `<div class="table-wrap"><table><thead><tr><th>Entity</th><th>Task</th><th>Owner</th><th>Progress</th><th>Status</th><th>Blocker</th></tr></thead><tbody>${state.data.closeTasks.slice(0,18).map(t=>`<tr><td>${safeText(t.entity)}</td><td>${safeText(t.task)}</td><td>${safeText(t.owner)}</td><td><div class="progress"><span style="width:${t.progress_pct}%"></span></div>${t.progress_pct}%</td><td><span class="tag ${t.status==='Completed'?'green':t.status==='At Risk'?'red':'amber'}">${safeText(t.status)}</span></td><td>${safeText(t.blocker)}</td></tr>`).join('')}</tbody></table></div>`;
}
function closeNarrative(readiness, blockers){
  const avg = Math.round(readiness.reduce((s,r)=>s+r.pct,0)/readiness.length);
  const top = blockers[0];
  return `Close readiness is ${avg}% across India entities. ${readiness.filter(r=>r.pct>84).length} entities are near CFO sign-off, while ${blockers.length} material blockers remain. The highest priority blocker is ${top ? `${top.task} for ${top.entity}, owned by ${top.owner}` : 'none'}, and the agent is assembling evidence packs for audit-ready close certification.`;
}

function renderRecon(){
  const records = state.data.reconciliationRecords;
  const matched = records.filter(r => r.status === 'Auto-matched').length;
  const exceptions = records.filter(r => r.status === 'Exception');
  const rails = groupBy(records,'payment_rail');
  return `
    <section class="hero"><div class="eyebrow">Payment & Reconciliation</div><h1>Move recon to exception-only operations</h1><p>The agent matches Stripe, Paytm, Razorpay, UPI, bank statements, driver payouts, refund ledger and GL — humans only review residual risk.</p></section>
    <section class="grid cols-4"><article class="card metric"><div class="label">Auto-matched</div><div class="value">${matched}</div><div class="delta">${pct(matched/records.length*100)} of records</div></article><article class="card metric"><div class="label">Unmatched / exceptions</div><div class="value">${exceptions.length}</div><div class="delta">Routed for review</div></article><article class="card metric"><div class="label">Live STP</div><div class="value">${Number(state.metrics.recon_stp_pct).toFixed(1)}%</div><div class="delta">Target: 95%+</div></article><article class="card metric"><div class="label">Cash exposure</div><div class="value">${money(exceptions.reduce((s,r)=>s+Math.abs(r.amount_bank_inr-r.amount_gateway_inr),0))}</div><div class="delta">Variance under investigation</div></article></section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Payment rail view</h3><p>Gateway, bank and GL triangulation by rail.</p></div></div><div class="bars">${Object.entries(rails).map(([rail,list])=>{const stp=list.filter(r=>r.status==='Auto-matched').length/list.length*100; return `<div class="bar-row"><span>${safeText(rail)}</span><div class="bar"><i style="width:${stp}%"></i></div><strong>${Math.round(stp)}%</strong></div>`}).join('')}</div></article><article class="card"><div class="section-head"><div><h3>Exception queue and root cause</h3><p>Resolve exceptions to update STP, open exceptions and audit trail.</p></div><button class="action-button" id="resolve-exception">Resolve Exception</button></div><div class="feed">${exceptions.slice(0,8).map(r=>`<div class="feed-item"><strong>${safeText(r.payment_rail)} · ${safeText(r.gateway_reference)} · ${money(r.amount_gateway_inr)}</strong><span>${safeText(r.root_cause)} · Owner: ${safeText(r.owner)} · Age: ${r.age_days}d</span><div class="meta"><b class="tag red">Exception</b><b class="tag purple">${Math.round(r.confidence*100)}% confidence</b><b class="tag">${safeText(r.city)}</b></div></div>`).join('')}</div></article></section>
    <section class="card"><div class="section-head"><div><h3>Matched vs unmatched records</h3><p>Every recon decision links gateway, bank, GL and evidence references.</p></div></div>${reconTable()}</section>`;
}
function reconTable(){
  return `<div class="table-wrap"><table><thead><tr><th>Rail</th><th>Gateway ref</th><th>Bank ref</th><th>GL ref</th><th>Gateway</th><th>Bank</th><th>Status</th><th>Root cause</th></tr></thead><tbody>${state.data.reconciliationRecords.slice(0,16).map(r=>`<tr><td>${safeText(r.payment_rail)}</td><td>${safeText(r.gateway_reference)}</td><td>${safeText(r.bank_reference)}</td><td>${safeText(r.gl_reference)}</td><td>${money(r.amount_gateway_inr)}</td><td>${money(r.amount_bank_inr)}</td><td><span class="tag ${r.status==='Auto-matched'?'green':r.status==='Exception'?'red':'amber'}">${safeText(r.status)}</span></td><td>${safeText(r.root_cause)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderRevenue(){
  const cases = state.data.revenueCases;
  const top = cases.slice(0,8);
  const total = cases.reduce((s,c)=>s+c.financial_impact_inr,0);
  const byType = groupBy(cases,'case_type');
  return `
    <section class="hero"><div class="eyebrow">Revenue Assurance + O2C</div><h1>Recover leakage before it becomes revenue noise</h1><p>AIonOS monitors the lifecycle from commercial setup to billing, cash and revenue recognition — detecting missing billing events, usage capture gaps and contract-to-invoice mismatches by value.</p></section>
    <section class="grid cols-3"><article class="card metric"><div class="label">Leakage pipeline</div><div class="value">${money(total)}</div><div class="delta">Ranked by materiality and risk</div></article><article class="card metric"><div class="label">Cases in radar</div><div class="value">${cases.length}</div><div class="delta">Owners assigned with SLA</div></article><article class="card metric"><div class="label">Recovered/prevented</div><div class="value">${money(state.metrics.leakage_detected_inr)}</div><div class="delta">Live impact</div></article></section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Leakage cases ranked by value</h3><p>The agent prioritizes recovery actions by financial impact, risk score and SLA clock.</p></div></div><div class="feed">${top.map(c=>`<div class="feed-item"><strong>${safeText(c.case_type)} · ${money(c.financial_impact_inr)}</strong><span>${safeText(c.city)} · ${safeText(c.product_line)} · ${safeText(c.root_cause)}</span><div class="meta"><b class="tag ${c.risk_score>85?'red':'amber'}">Risk ${c.risk_score}</b><b class="tag">${safeText(c.owner)}</b><b class="tag purple">SLA ${c.sla_hours_remaining}h</b></div></div>`).join('')}</div></article><article class="card"><div class="section-head"><div><h3>Detection mix</h3><p>Missing billing, usage capture and contract/invoice controls.</p></div></div><div class="bars">${Object.entries(byType).map(([type,list])=>`<div class="bar-row"><span>${safeText(type)}</span><div class="bar"><i style="width:${Math.min(100,list.length/cases.length*220)}%"></i></div><strong>${list.length}</strong></div>`).join('')}</div></article></section>
    <section class="card"><div class="section-head"><div><h3>Owner assignment and SLA tracking</h3><p>Each case carries root cause, recommended action and evidence references.</p></div></div>${revenueTable()}</section>`;
}
function revenueTable(){
  return `<div class="table-wrap"><table><thead><tr><th>Case</th><th>Type</th><th>City</th><th>Product</th><th>Impact</th><th>Risk</th><th>Owner</th><th>Recommended action</th></tr></thead><tbody>${state.data.revenueCases.slice(0,16).map(c=>`<tr><td>${safeText(c.case_id)}</td><td>${safeText(c.case_type)}</td><td>${safeText(c.city)}</td><td>${safeText(c.product_line)}</td><td>${money(c.financial_impact_inr)}</td><td><span class="tag ${c.risk_score>85?'red':'amber'}">${c.risk_score}</span></td><td>${safeText(c.owner)}</td><td>${safeText(c.recommended_action)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderCFO(){
  const m = state.metrics;
  const forecast = state.data.cfoMetrics.forecast;
  const variances = state.data.cfoMetrics.city_product_variance;
  return `
    <section class="hero"><div class="eyebrow">CFO Performance Cockpit</div><h1>Give finance leaders same-day answers, not next-week dashboards</h1><p>Management reporting, variance analysis and forecasts become AI-narrated, drillable and action-oriented by city, product line and driver cohort.</p></section>
    <section class="grid cols-4"><article class="card metric"><div class="label">Revenue forecast</div><div class="value">${money(forecast.month_end_revenue_inr)}</div><div class="delta">Confidence ${Math.round(forecast.forecast_confidence*100)}%</div></article><article class="card metric"><div class="label">Cash collections</div><div class="value">${money(forecast.cash_collections_inr)}</div><div class="delta">Live payment signals</div></article><article class="card metric"><div class="label">Driver cost</div><div class="value">${money(forecast.driver_cost_inr)}</div><div class="delta">Cohort-level variance</div></article><article class="card metric negative"><div class="label">Budget variance</div><div class="value">${forecast.variance_to_budget_pct}%</div><div class="delta">Explained by city/product/cohort</div></article></section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Plain-English finance commentary</h3><p>Dynamic narrative generated from the current simulation state.</p></div><button class="action-button alt" id="narrative-refresh">Generate CFO Narrative</button></div><p class="narrative">${safeText(state.cfoNarrative || buildCfoNarrative())}</p></article><article class="card"><div class="section-head"><div><h3>Recommended corrective actions</h3><p>Each prompt includes estimated financial impact and control evidence.</p></div></div><div class="feed">${state.data.cfoMetrics.recommended_actions.map(a=>`<div class="feed-item"><strong>${safeText(a.action)} · ${money(a.impact_inr)}</strong><span>${safeText(a.control_evidence)}</span><div class="meta"><b class="tag green">${Math.round(a.confidence*100)}% confidence</b><b class="tag purple">Actionable</b></div></div>`).join('')}</div></article></section>
    <section class="card"><div class="section-head"><div><h3>City / product / driver cohort drilldown</h3><p>Variance narration identifies where finance should intervene first.</p></div></div><div class="bars">${variances.map(v=>`<div class="bar-row"><span>${safeText(v.city)} · ${safeText(v.product_line)}</span><div class="bar"><i style="width:${Math.min(100,Math.abs(v.variance_pct)*7)}%"></i></div><strong>${v.variance_pct}%</strong></div>`).join('')}</div>${varianceTable()}</section>`;
}
function varianceTable(){
  return `<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>City</th><th>Product</th><th>Actual</th><th>Budget</th><th>Variance</th><th>Driver cohort</th></tr></thead><tbody>${state.data.cfoMetrics.city_product_variance.map(v=>`<tr><td>${safeText(v.city)}</td><td>${safeText(v.product_line)}</td><td>${money(v.actual_inr)}</td><td>${money(v.budget_inr)}</td><td><span class="tag ${v.variance_pct>=0?'green':'red'}">${v.variance_pct}%</span></td><td>${safeText(v.driver_cohort)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderGovernance(){
  return `
    <section class="hero"><div class="eyebrow">Governance & Controlled Autonomy</div><h1>Autonomous finance only works when controls are explicit</h1><p>The operating model defines what agents can decide, what needs approval and what must always be auditable. Every decision remains traceable, measurable and reproducible from JSON.</p></section>
    <section class="matrix">
      <article class="card"><h4><span class="status-dot"></span>Autonomous</h4><p>Low-risk postings, high-confidence payment matches, alerts and evidence packs execute within thresholds.</p><div class="rule-list"><div class="rule"><span>JE auto-post</span><strong>&lt; ₹5L + confidence ≥ 92%</strong></div><div class="rule"><span>Recon auto-match</span><strong>Confidence ≥ 91%</strong></div><div class="rule"><span>Evidence pack</span><strong>Always logged</strong></div></div></article>
      <article class="card"><h4><span class="status-dot warn"></span>Human-in-loop</h4><p>Material JEs, policy exceptions, IC/FX entries and recovery actions require approval before execution.</p><div class="rule-list"><div class="rule"><span>Material JE</span><strong>&gt; ₹5L</strong></div><div class="rule"><span>IC / FX</span><strong>Controller approval</strong></div><div class="rule"><span>Revenue recovery</span><strong>Owner sign-off</strong></div></div></article>
      <article class="card"><h4><span class="status-dot blue"></span>Human-on-loop</h4><p>Continuous monitoring, evaluation, cost, drift checks and policy tuning create governance over scale.</p><div class="rule-list"><div class="rule"><span>Monitoring</span><strong>Always-on</strong></div><div class="rule"><span>Confidence drift</span><strong>Escalate below 80%</strong></div><div class="rule"><span>Auditability</span><strong>100% trace hash</strong></div></div></article>
    </section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Policy rules and approval history</h3><p>Controlled autonomy matrix is applied to every live decision.</p></div></div>${rulesTable()}</article><article class="card"><div class="section-head"><div><h3>Export audit pack</h3><p>Download full audit evidence JSON for journals, recon, revenue assurance, approvals, policy guardrails and trace hashes.</p></div><button id="export-audit" class="action-button">Export full audit pack JSON</button></div><div class="glow-number">${Number(state.metrics.audit_readiness_pct).toFixed(1)}%</div><p>Audit readiness score is continuously lifted as agents attach source references, policy rules, approvals and evidence to each action.</p></article></section>
    <section class="card"><div class="section-head"><div><h3>Audit trail table</h3><p>Every action is reproducible from JSON — source event, agent decision, autonomy mode, confidence, approval and evidence references.</p></div></div>${auditTable()}</section>`;
}
function rulesTable(){
  return `<div class="table-wrap"><table><thead><tr><th>Rule</th><th>Event</th><th>Autonomy</th><th>Threshold</th><th>Policy</th></tr></thead><tbody>${state.data.journalRules.map(r=>`<tr><td>${safeText(r.name)}</td><td>${safeText(r.event_type)}</td><td><span class="tag ${r.autonomy==='Autonomous'?'green':r.autonomy==='Human-in-loop'?'amber':'purple'}">${safeText(r.autonomy)}</span></td><td>${money(r.materiality_threshold_inr)}</td><td>${safeText(r.policy)}</td></tr>`).join('')}</tbody></table></div>`;
}
function auditTable(){
  return `<div class="table-wrap"><table><thead><tr><th>Audit ID</th><th>Timestamp</th><th>Agent</th><th>Decision</th><th>Mode</th><th>Confidence</th><th>Impact</th><th>Approval</th><th>Trace</th></tr></thead><tbody>${state.data.auditTrail.slice(0,24).map(a=>`<tr><td>${safeText(a.audit_id)}</td><td>${safeText(a.timestamp)}</td><td>${safeText(a.agent)}</td><td>${safeText(a.decision)}</td><td><span class="tag ${a.autonomy_mode==='Autonomous'?'green':a.autonomy_mode==='Human-in-loop'?'amber':'purple'}">${safeText(a.autonomy_mode)}</span></td><td>${Math.round(a.confidence*100)}%</td><td>${money(a.financial_impact_inr)}</td><td>${safeText(a.approval_status)}</td><td>${safeText(a.trace_hash)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderRollout(){
  return `
    <section class="hero"><div class="eyebrow">Business case and path to value</div><h1>Prove one use case, scale the common agent foundation in 90 days</h1><p>Start with the FinOps agent pod that attacks close cost fastest, then extend the same orchestration, policy and evidence layer across recon, revenue assurance and CFO cockpit.</p></section>
    <section class="grid cols-4"><article class="card metric"><div class="label">Close compression</div><div class="value">60%</div><div class="delta">Reduction in days-to-close</div></article><article class="card metric"><div class="label">Journal effort</div><div class="value">80%</div><div class="delta">Fewer manual journals</div></article><article class="card metric"><div class="label">Recon STP</div><div class="value">95%</div><div class="delta">Straight-through reconciliation</div></article><article class="card metric"><div class="label">Audit evidence</div><div class="value">100%</div><div class="delta">Audit-ready traceability</div></article></section>
    <section class="card"><div class="section-head"><div><h3>90-day rollout</h3><p>From baseline discovery to validated production workflow — without ERP replacement.</p></div><span class="tag green">Works on top of SAP / Oracle / Hyperion / payments / billing systems</span></div><div class="timeline">
      <div class="phase"><div class="week">Weeks 1–2<br>Discover</div><div><h4>Map pain points and baseline KPIs</h4><ul><li>Inventory finance events, payment rails, billing signals and close tasks.</li><li>Confirm materiality thresholds, CoA policy and evidence requirements.</li><li>Select first PoC: journals, close, recon or revenue assurance.</li></ul></div></div>
      <div class="phase"><div class="week">Weeks 3–6<br>Validate</div><div><h4>Build agent workflow with historical transactions</h4><ul><li>Train rules on synthetic and historical-like finance events.</li><li>Validate CoA mapping, match confidence, policy routing and approvals.</li><li>Run CFO demos with before/after KPIs and audit traceability.</li></ul></div></div>
      <div class="phase"><div class="week">Weeks 7–12<br>Scale</div><div><h4>Integrate live workflow and expand agent pod</h4><ul><li>Connect live transaction streams on top of ERP/payment/billing extracts.</li><li>Add revenue assurance, CFO narrative and governance telemetry.</li><li>Operationalize agent monitoring, cost, drift, approvals and audit packs.</li></ul></div></div>
    </div></section>
    <section class="grid cols-2"><article class="card"><div class="section-head"><div><h3>Operating-layer architecture</h3><p>No rip-and-replace — AIonOS sits above existing systems as a governed action layer.</p></div></div><div class="waterfall"><div style="height:76px">Transaction capture</div><div style="height:102px">GL + journals</div><div style="height:126px">Period-end close</div><div style="height:112px">Payment recon</div><div style="height:92px">IC + FX</div><div style="height:138px">CFO reporting</div><div style="height:156px">Audit evidence</div></div></article><article class="card"><div class="section-head"><div><h3>Executive insight</h3><p>AIonOS becomes the FinOps control plane: monitor transactions, investigate exceptions, execute inside guardrails, and provide CFO-ready narratives with evidence.</p></div></div><p class="narrative">The business case is not limited to task automation. The value comes from converting Uber India Finance into exception-led operations across high-volume transaction surfaces, multi-entity reporting, payments, taxes, close, revenue assurance and governance — while keeping core ERP investments intact.</p></article></section>`;
}

function attachScreenHandlers(){
  document.querySelectorAll('.scenario-run').forEach(btn => btn.addEventListener('click', () => runScenario(btn.dataset.scenario)));
  const approve = getById('approve-je');
  if(approve) approve.addEventListener('click', approveJE);
  const exportJE = getById('export-je');
  if(exportJE) exportJE.addEventListener('click', exportJEEvidence);
  const resolve = getById('resolve-exception');
  if(resolve) resolve.addEventListener('click', resolveException);
  const narrative = getById('narrative-refresh');
  if(narrative) narrative.addEventListener('click', () => getById('generate-narrative').click());
  const audit = getById('export-audit');
  if(audit) audit.addEventListener('click', exportAuditPack);
}

function approveJE(){
  const je = state.data.journalEntries.find(j => j.status === 'Awaiting Approval' || j.status === 'Validation Hold' || j.status === 'Draft');
  if(!je){ toast('No journal entries are awaiting approval.'); return; }
  je.status = 'Posted';
  je.approver = 'Approved in demo by Finance Controller';
  state.metrics.manual_journals = Math.max(0, state.metrics.manual_journals - 1);
  state.metrics.audit_readiness_pct = clamp(state.metrics.audit_readiness_pct + .4, 0, 100);
  addAudit({agent:'Journal Entry Agent', source_event_id:je.source_event_id, decision:`Approved and posted ${je.je_id}`, autonomy_mode:'Human-in-loop', confidence:je.confidence, financial_impact_inr:je.debit.amount_inr, policy_guardrail:'Material JE approval', approval_status:'Approved', evidence_refs:je.evidence_refs});
  toast(`${je.je_id} approved, posted and written to audit trail.`);
  render(); persist();
}

function resolveException(){
  const rec = state.data.reconciliationRecords.find(r => r.status === 'Exception');
  if(!rec){ toast('No reconciliation exceptions remain in the current queue.'); return; }
  rec.status = 'Auto-matched';
  rec.confidence = Math.max(rec.confidence, .94);
  rec.root_cause = 'Resolved by demo user: evidence attached and variance cleared';
  state.metrics.open_exceptions = Math.max(0, state.metrics.open_exceptions - 1);
  state.metrics.recon_stp_pct = clamp(state.metrics.recon_stp_pct + .8, 0, 99);
  state.metrics.audit_readiness_pct = clamp(state.metrics.audit_readiness_pct + .3, 0, 100);
  addAudit({agent:'Payment & Reconciliation Agent', source_event_id:rec.recon_id, decision:`Resolved payment exception ${rec.recon_id}`, autonomy_mode:'Human-in-loop', confidence:rec.confidence, financial_impact_inr:rec.amount_gateway_inr, policy_guardrail:'Exception resolution evidence', approval_status:'Approved', evidence_refs:rec.audit_evidence});
  toast(`${rec.recon_id} resolved; STP and audit readiness updated.`);
  render(); persist();
}

function exportJEEvidence(){
  const je = latestJE();
  const pack = {
    exported_at: nowIso(),
    title:'AIonOS Uber JE Evidence Pack',
    journal_entry:je,
    source_event: state.data.financeEvents.find(e => e.event_id === je.source_event_id) || state.liveEvents.find(e => e.event_id === je.source_event_id),
    policy_rule: state.data.journalRules.find(r => r.rule_id === je.rule_id),
    audit_records: state.data.auditTrail.filter(a => a.source_event_id === je.source_event_id || a.evidence_refs?.some(ref => je.evidence_refs?.includes(ref)))
  };
  downloadJson(pack, `uber-je-evidence-${je.je_id}.json`);
  addAudit({agent:'Governance Agent', source_event_id:je.source_event_id, decision:`Exported JE evidence ${je.je_id}`, autonomy_mode:'Human-on-loop', confidence:.99, policy_guardrail:'Evidence export', approval_status:'Not required', evidence_refs:je.evidence_refs});
  persist(); toast('JE evidence JSON exported.');
}

function exportAuditPack(){
  const pack = {
    exported_at: nowIso(),
    title:'AIonOS Agentic FinOps Mission Control for Uber - Full Audit Pack',
    metrics: state.metrics,
    agents: state.agents,
    journal_entries: state.data.journalEntries,
    reconciliation_records: state.data.reconciliationRecords,
    revenue_leakage_cases: state.data.revenueCases,
    close_tasks: state.data.closeTasks,
    policy_rules: state.data.journalRules,
    scenarios: state.data.scenarios,
    audit_trail: state.data.auditTrail
  };
  downloadJson(pack, 'uber-finops-full-audit-pack.json');
  addAudit({agent:'Governance Agent', decision:'Exported full audit pack JSON', autonomy_mode:'Human-on-loop', confidence:.99, policy_guardrail:'Audit pack export', approval_status:'Not required', evidence_refs:['FULL-AUDIT-PACK','LOCALSTORAGE-STATE']});
  persist(); toast('Full audit pack JSON exported.');
}

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function groupBy(arr, key){
  return arr.reduce((acc,item) => {
    const val = item[key] || 'Unknown';
    (acc[val] ||= []).push(item);
    return acc;
  }, {});
}

let toastTimer;
function toast(message){
  const el = getById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 3200);
}

boot().catch(err => {
  console.error(err);
  getById('app').innerHTML = `<section class="hero"><h1>Could not load demo assets</h1><p>${safeText(err.message)}. Run this folder through a static server so the browser can fetch /data JSON files.</p></section>`;
});
