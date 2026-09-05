export const SPEECH2WRITE_REPOSITORY_URL = 'https://github.com/ChipmunkRPA/speech2write'

// Keep all installation files pinned to the same verified release.
export const SPEECH2WRITE_VERSION = '1.4.1'
export const SPEECH2WRITE_RELEASE_URL = `${SPEECH2WRITE_REPOSITORY_URL}/releases/tag/v${SPEECH2WRITE_VERSION}`
export const SPEECH2WRITE_DOWNLOAD_URL = `${SPEECH2WRITE_REPOSITORY_URL}/releases/download/v${SPEECH2WRITE_VERSION}/Speech2Write-${SPEECH2WRITE_VERSION}.zip`
export const SPEECH2WRITE_INSTALLER_URL = `${SPEECH2WRITE_REPOSITORY_URL}/releases/download/v${SPEECH2WRITE_VERSION}/install.sh`
export const SPEECH2WRITE_CHECKSUMS_URL = `${SPEECH2WRITE_REPOSITORY_URL}/releases/download/v${SPEECH2WRITE_VERSION}/SHA256SUMS`

export const SPEECH2WRITE_FILES = [
  { name: 'install.sh', url: SPEECH2WRITE_INSTALLER_URL },
  { name: 'SHA256SUMS', url: SPEECH2WRITE_CHECKSUMS_URL },
  { name: `Speech2Write-${SPEECH2WRITE_VERSION}.zip`, url: SPEECH2WRITE_DOWNLOAD_URL },
] as const
