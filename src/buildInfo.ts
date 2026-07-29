export interface LoopVaultBuildInfo {
  version: string;
  commit: string;
  builtAt: string;
}

export const loopVaultBuildInfo: LoopVaultBuildInfo = {
  version: __LOOP_VAULT_VERSION__,
  commit: __LOOP_VAULT_BUILD_COMMIT__,
  builtAt: __LOOP_VAULT_BUILD_DATE__,
};
