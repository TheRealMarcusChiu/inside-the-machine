/// <reference lib="webworker" />
import { handleSimulationRequest, type SimulationRequest } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  self.postMessage(handleSimulationRequest(event.data));
};
