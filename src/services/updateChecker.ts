import { GitHubReleaseInfo } from '../types';

export const CURRENT_VERSION_NAME = 'v1.0.0';
export const CURRENT_VERSION_CODE = 1;

export async function checkForAppUpdates(repoOwner: string, repoName: string, personalToken?: string): Promise<{
  updateAvailable: boolean;
  currentVersion: string;
  release?: GitHubReleaseInfo;
  message?: string;
}> {
  if (!repoOwner || !repoName) {
    return {
      updateAvailable: false,
      currentVersion: CURRENT_VERSION_NAME,
      message: 'Please configure GitHub Owner and Repository in Settings to check for updates.',
    };
  }

  try {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };

    if (personalToken && personalToken.trim().length > 0) {
      headers['Authorization'] = `Bearer ${personalToken.trim()}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        return {
          updateAvailable: false,
          currentVersion: CURRENT_VERSION_NAME,
          message: 'No published releases found on this repository yet.',
        };
      }
      return {
        updateAvailable: false,
        currentVersion: CURRENT_VERSION_NAME,
        message: `GitHub API error (${response.status}): ${response.statusText}`,
      };
    }

    const release = await response.json();
    const tagName = release.tag_name || 'v1.0.0';

    // Parse version number from tag (e.g. "v1.2.0" -> versionCode: 120 or extracted from release)
    const codeMatch = tagName.replace(/[^0-9.]/g, '').split('.');
    let remoteCode = 0;
    if (codeMatch.length >= 3) {
      remoteCode = parseInt(codeMatch[0], 10) * 10000 + parseInt(codeMatch[1], 10) * 100 + parseInt(codeMatch[2], 10);
    } else if (codeMatch.length >= 2) {
      remoteCode = parseInt(codeMatch[0], 10) * 100 + parseInt(codeMatch[1], 10);
    } else if (codeMatch.length === 1 && codeMatch[0]) {
      remoteCode = parseInt(codeMatch[0], 10);
    }

    // Look for apk asset
    const apkAsset = release.assets?.find((a: { name: string }) => a.name.endsWith('.apk'));
    const shaAsset = release.assets?.find((a: { name: string }) => a.name.endsWith('.sha256') || a.name.endsWith('.txt'));

    let sha256: string | undefined;
    if (shaAsset && shaAsset.browser_download_url) {
      try {
        const shaRes = await fetch(shaAsset.browser_download_url);
        if (shaRes.ok) {
          const text = await shaRes.text();
          sha256 = text.trim().split(/\s+/)[0];
        }
      } catch (e) {
        console.warn('Could not fetch sha256 checksum:', e);
      }
    }

    const releaseInfo: GitHubReleaseInfo = {
      tagName,
      versionName: tagName,
      versionCode: remoteCode || 1,
      releaseNotes: release.body || 'No release notes provided.',
      publishedAt: release.published_at || '',
      downloadUrl: apkAsset ? apkAsset.browser_download_url : release.html_url,
      assetName: apkAsset ? apkAsset.name : 'AuraDailyTracker.apk',
      assetSize: apkAsset ? apkAsset.size : 0,
      sha256,
    };

    // Compare with current version
    const updateAvailable = remoteCode > CURRENT_VERSION_CODE;

    return {
      updateAvailable,
      currentVersion: CURRENT_VERSION_NAME,
      release: releaseInfo,
      message: updateAvailable
        ? `New version ${tagName} is ready to install.`
        : 'You are using the latest version.',
    };
  } catch (error) {
    return {
      updateAvailable: false,
      currentVersion: CURRENT_VERSION_NAME,
      message: `Failed to check for updates: ${(error as Error).message}`,
    };
  }
}

/**
 * Computes SHA-256 of an ArrayBuffer in browser / webview using Web Crypto API
 */
export async function calculateSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
