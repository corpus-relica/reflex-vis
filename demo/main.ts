import { ReflexDevtools } from '../src/index.js';
import { MockEngine } from './mock-engine.js';
import { allWorkflows, linearWorkflow } from './workflows.js';

// --- Mock engine setup ---
const engine = new MockEngine(allWorkflows);

// --- Mount devtools ---
const container = document.getElementById('devtools-container')!;
const devtools = new ReflexDevtools(engine as any, {
  container,
  panels: ['dag', 'stack', 'blackboard', 'events'],
  height: 350,
});

// --- Controls ---
const workflowSelect = document.getElementById('workflow-select') as HTMLSelectElement;
const speedInput = document.getElementById('speed-input') as HTMLInputElement;

function btn(id: string, handler: () => void) {
  document.getElementById(id)?.addEventListener('click', handler);
}

btn('btn-init', () => {
  engine.reset();
  devtools.destroy();
  const dt = new ReflexDevtools(engine as any, {
    container,
    panels: ['dag', 'stack', 'blackboard', 'events'],
    height: 350,
  });
  engine.init(workflowSelect.value);
  const workflow = engine.getWorkflow(workflowSelect.value);
  if (workflow) (dt as any)._dagPanel?.showWorkflow(workflow);
});

btn('btn-step', () => {
  engine.step();
});

btn('btn-autoplay', () => {
  const speed = parseInt(speedInput.value, 10) || 800;
  engine.autoplay(speed);
});

btn('btn-stop', () => {
  engine.stopAutoplay();
});

btn('btn-write-bb', () => {
  const keys = ['temperature', 'confidence', 'iterations', 'result', 'status'];
  const key = keys[Math.floor(Math.random() * keys.length)];
  const value = Math.random() > 0.5
    ? Math.round(Math.random() * 100) / 10
    : ['pending', 'active', 'resolved', 'error'][Math.floor(Math.random() * 4)];
  engine.writeBlackboard([{ key, value }]);
});

btn('btn-suspend', () => {
  engine.suspend('Demo pause');
});

btn('btn-complete', () => {
  engine.complete();
});

btn('btn-push', () => {
  const child = engine.getWorkflow('child-sub');
  if (child) engine.pushWorkflow(child);
});

btn('btn-pop', () => {
  engine.popWorkflow();
});

// --- Auto-init the linear workflow for immediate visual ---
engine.init(linearWorkflow.id);
const initWorkflow = engine.getWorkflow(linearWorkflow.id);
if (initWorkflow) (devtools as any)._dagPanel?.showWorkflow(initWorkflow);
