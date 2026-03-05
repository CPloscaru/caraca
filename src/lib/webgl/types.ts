import type { WebGLRenderTarget } from 'three';

/** Data shape flowing through webgl ports between nodes */
export type WebGLNodeOutput = {
  target: WebGLRenderTarget;
  width: number;
  height: number;
};

/** Callback signature for RAF loop registration */
export type RenderCallback = (time: number, deltaTime: number) => void;
