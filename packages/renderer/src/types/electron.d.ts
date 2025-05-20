import { ElectronApi } from '@ig-live/types';

declare global {
  interface Window extends ElectronApi { }
} 