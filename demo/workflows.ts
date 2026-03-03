/**
 * Sample workflow definitions for the demo harness.
 */

import type { Workflow } from '@corpus-relica/reflex';

/** Simple linear workflow: A → B → C → D */
export const linearWorkflow: Workflow = {
  id: 'linear-demo',
  entry: 'start',
  nodes: {
    start: { id: 'start', spec: { action: 'initialize' }, description: 'Initialize session' },
    process: { id: 'process', spec: { action: 'process' }, description: 'Process input data' },
    validate: { id: 'validate', spec: { action: 'validate' }, description: 'Validate results' },
    finish: { id: 'finish', spec: { action: 'output' }, description: 'Emit output' },
  },
  edges: [
    { id: 'e1', from: 'start', to: 'process', event: 'next' },
    { id: 'e2', from: 'process', to: 'validate', event: 'next' },
    { id: 'e3', from: 'validate', to: 'finish', event: 'next' },
  ],
};

/** Branching workflow with guards: decision point fans out to two paths */
export const branchingWorkflow: Workflow = {
  id: 'branching-demo',
  entry: 'intake',
  nodes: {
    intake: { id: 'intake', spec: { action: 'intake' }, description: 'Receive request' },
    classify: { id: 'classify', spec: { action: 'classify' }, description: 'Classify input type' },
    'path-a': { id: 'path-a', spec: { action: 'handle-type-a' }, description: 'Handle type A' },
    'path-b': { id: 'path-b', spec: { action: 'handle-type-b' }, description: 'Handle type B' },
    merge: { id: 'merge', spec: { action: 'merge' }, description: 'Merge results' },
    output: { id: 'output', spec: { action: 'output' }, description: 'Emit response' },
  },
  edges: [
    { id: 'e1', from: 'intake', to: 'classify', event: 'next' },
    {
      id: 'e2a', from: 'classify', to: 'path-a', event: 'type-a',
      guard: { type: 'equals', key: 'inputType', value: 'A' },
    },
    {
      id: 'e2b', from: 'classify', to: 'path-b', event: 'type-b',
      guard: { type: 'equals', key: 'inputType', value: 'B' },
    },
    { id: 'e3a', from: 'path-a', to: 'merge', event: 'done' },
    { id: 'e3b', from: 'path-b', to: 'merge', event: 'done' },
    { id: 'e4', from: 'merge', to: 'output', event: 'next' },
  ],
};

/** Child workflow for nested composition */
export const childWorkflow: Workflow = {
  id: 'child-sub',
  entry: 'sub-init',
  nodes: {
    'sub-init': { id: 'sub-init', spec: { action: 'sub-init' }, description: 'Sub-workflow start' },
    'sub-work': { id: 'sub-work', spec: { action: 'sub-work' }, description: 'Do sub-task' },
    'sub-done': { id: 'sub-done', spec: { action: 'sub-done' }, description: 'Sub-workflow end' },
  },
  edges: [
    { id: 'se1', from: 'sub-init', to: 'sub-work', event: 'next' },
    { id: 'se2', from: 'sub-work', to: 'sub-done', event: 'next' },
  ],
};

/** Parent workflow that invokes the child */
export const nestedWorkflow: Workflow = {
  id: 'nested-demo',
  entry: 'begin',
  nodes: {
    begin: { id: 'begin', spec: { action: 'begin' }, description: 'Start parent' },
    invoke: {
      id: 'invoke', spec: { action: 'invoke-child' }, description: 'Call sub-workflow',
      invokes: { workflowId: 'child-sub', returnMap: [{ parentKey: 'result', childKey: 'output' }] },
    },
    'after-invoke': { id: 'after-invoke', spec: { action: 'continue' }, description: 'After sub-workflow' },
    end: { id: 'end', spec: { action: 'end' }, description: 'Finish parent' },
  },
  edges: [
    { id: 'ne1', from: 'begin', to: 'invoke', event: 'next' },
    { id: 'ne2', from: 'invoke', to: 'after-invoke', event: 'returned' },
    { id: 'ne3', from: 'after-invoke', to: 'end', event: 'next' },
  ],
};

export const allWorkflows = [linearWorkflow, branchingWorkflow, childWorkflow, nestedWorkflow];
