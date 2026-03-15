'use strict';

const https = require('https');

const GITHUB_REPO   = 'HelloJohn-OSS/hellojohn';
const GITHUB_API    = 'api.github.com';
const ACCEPT_HEADER = 'application/vnd.github+json';
const API_VERSION   = '2022-11-28';

/**
 * Fetches information about a GitHub release.
 *
 * @param {string} [tag]  - Release tag (e.g. 'v1.2.3'). Omit for latest.
 * @returns {Promise<{ tag: string, assets: Array<{ name, browser_download_url, size }> }>}
 */
async function fetchRelease(tag) {
  const path = tag
    ? `/repos/${GITHUB_REPO}/releases/tags/${tag}`
    : `/repos/${GITHUB_REPO}/releases/latest`;

  const data = await githubGet(path);
  return {
    tag: data.tag_name,
    assets: (data.assets || []).map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    })),
  };
}

/**
 * Finds a download URL for a named asset in a release.
 *
 * @param {object} release  - Output of fetchRelease()
 * @param {string} name     - Asset filename to find
 * @returns {{ url: string, size: number }}
 */
function findAsset(release, name) {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) {
    throw new Error(
      `Asset "${name}" not found in release ${release.tag}.\n` +
      `Available assets:\n${release.assets.map((a) => `  - ${a.name}`).join('\n')}\n\n` +
      `Manual download: https://github.com/${GITHUB_REPO}/releases/tag/${release.tag}`
    );
  }
  return { url: asset.url, size: asset.size };
}

// ─── internal ───────────────────────────────────────────────────────────────

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GITHUB_API,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'hellojohn-oss-installer/1.0',
        'Accept': ACCEPT_HEADER,
        'X-GitHub-Api-Version': API_VERSION,
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow one redirect
        return resolve(githubGetUrl(res.headers.location));
      }

      if (res.statusCode === 404) {
        return reject(new Error(
          `Release not found (404). Check that the tag exists at:\n` +
          `https://github.com/${GITHUB_REPO}/releases`
        ));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API error: HTTP ${res.statusCode} for ${path}`));
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error(`Failed to parse GitHub API response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Network error fetching release info: ${e.message}`)));
    req.end();
  });
}

function githubGetUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'hellojohn-oss-installer/1.0',
        'Accept': ACCEPT_HEADER,
        'X-GitHub-Api-Version': API_VERSION,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(new Error(`Failed to parse redirect response: ${e.message}`));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`Redirect error: ${e.message}`)));
  });
}

module.exports = { fetchRelease, findAsset, GITHUB_REPO };
