/**
 * SKCommClient — thin fetch wrapper for the SKComm REST API.
 *
 * Handles connectivity to the local SKComm server (localhost:9384 by default).
 * All methods return resolved data or throw on error. The popup and background
 * should catch errors and handle offline gracefully — this client does not swallow.
 *
 * @module skcomm_client
 */

/**
 * Client for the SKComm REST API.
 *
 * @example
 * const client = new SKCommClient();
 * const ok = await client.status();
 * if (ok) {
 *   const id = await client.captureSnapshot(mySnapshot);
 * }
 */
export class SKCommClient {
  /**
   * @param {string} [baseUrl='http://localhost:9384'] - Base URL for the SKComm API.
   * @param {number} [timeoutMs=5000] - Request timeout in milliseconds.
   */
  constructor(baseUrl = "http://localhost:9384", timeoutMs = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  // --------------------------------------------------------------------------
  // Core transport
  // --------------------------------------------------------------------------

  /**
   * Make an authenticated fetch call with timeout.
   *
   * @param {string} path - API path (e.g. '/api/v1/status')
   * @param {RequestInit} [options={}] - Fetch options
   * @returns {Promise<any>} Parsed JSON response
   * @throws {Error} On network failure, timeout, or non-2xx response
   */
  async _fetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
      });

      clearTimeout(timer);

      if (!resp.ok) {
        let detail = "";
        try {
          const body = await resp.json();
          detail = body.detail ?? JSON.stringify(body);
        } catch {
          detail = await resp.text();
        }
        throw new Error(`SKComm API error ${resp.status}: ${detail}`);
      }

      // 204 No Content — nothing to parse
      if (resp.status === 204) return null;

      return await resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`SKComm request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Core SKComm endpoints
  // --------------------------------------------------------------------------

  /**
   * Check if the SKComm server is reachable.
   *
   * @returns {Promise<boolean>} True if server responds, false otherwise.
   */
  async isReachable() {
    try {
      await this._fetch("/api/v1/status");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get full SKComm status.
   *
   * @returns {Promise<Object>} Status object with identity and transport health.
   */
  async status() {
    return this._fetch("/api/v1/status");
  }

  /**
   * Send a message through SKComm.
   *
   * @param {string} recipient - Agent name or fingerprint.
   * @param {string} message - Message content.
   * @param {Object} [opts={}] - Optional overrides (message_type, thread_id, urgency).
   * @returns {Promise<{delivered: boolean, envelope_id: string}>}
   */
  async send(recipient, message, opts = {}) {
    return this._fetch("/api/v1/send", {
      method: "POST",
      body: JSON.stringify({ recipient, message, ...opts }),
    });
  }

  /**
   * Get messages from the inbox.
   *
   * @returns {Promise<Array>} List of received envelopes.
   */
  async receive() {
    return this._fetch("/api/v1/inbox");
  }

  /**
   * Get known peers.
   *
   * @returns {Promise<Array>} List of peer objects.
   */
  async peers() {
    return this._fetch("/api/v1/peers");
  }

  // --------------------------------------------------------------------------
  // Consciousness / Snapshot endpoints
  // --------------------------------------------------------------------------

  /**
   * Capture and persist a soul snapshot via the API.
   *
   * @param {Object} snapshot - SoulSnapshot payload (from makeSoulSnapshot)
   * @returns {Promise<{snapshot_id: string, source_platform: string, captured_at: string}>}
   */
  async captureSnapshot(snapshot) {
    return this._fetch("/api/v1/consciousness/capture", {
      method: "POST",
      body: JSON.stringify(snapshot),
    });
  }

  /**
   * List all stored snapshots.
   *
   * @param {Object} [filters={}] - Optional {platform, ai_name} filters.
   * @returns {Promise<Array>} List of snapshot index entries.
   */
  async getSnapshots(filters = {}) {
    const params = new URLSearchParams();
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.ai_name) params.set("ai_name", filters.ai_name);
    const qs = params.toString() ? `?${params}` : "";
    return this._fetch(`/api/v1/consciousness/snapshots${qs}`);
  }

  /**
   * Get a specific snapshot by ID.
   *
   * @param {string} snapshotId - The 12-char hex snapshot ID.
   * @returns {Promise<Object>} Full snapshot detail.
   */
  async getSnapshot(snapshotId) {
    return this._fetch(`/api/v1/consciousness/snapshots/${snapshotId}`);
  }

  /**
   * Delete a snapshot.
   *
   * @param {string} snapshotId - The snapshot to delete.
   * @returns {Promise<null>}
   */
  async deleteSnapshot(snapshotId) {
    return this._fetch(`/api/v1/consciousness/snapshots/${snapshotId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get the injection prompt for a snapshot.
   *
   * @param {string} snapshotId - The snapshot ID.
   * @param {number} [maxMessages=10] - Max recent messages to include.
   * @returns {Promise<{snapshot_id: string, prompt: string, ai_name: string, platform: string}>}
   */
  async getInjectionPrompt(snapshotId, maxMessages = 10) {
    return this._fetch(
      `/api/v1/consciousness/snapshots/${snapshotId}/inject?max_messages=${maxMessages}`
    );
  }

  // --------------------------------------------------------------------------
  // Multi-target export (v0.2)
  // --------------------------------------------------------------------------

  /**
   * Export a snapshot to Syncthing via the local SKComm relay.
   *
   * The SKComm server writes the snapshot JSON to a Syncthing-watched folder
   * on the host machine. The browser extension cannot write files directly.
   *
   * @param {Object} snapshot - Full SoulSnapshot payload.
   * @param {Object} config
   * @param {string} config.relayUrl  - SKComm relay base URL (default: this.baseUrl).
   * @param {string} config.folder    - Syncthing folder ID or path.
   * @returns {Promise<{exported: boolean, path: string}>}
   */
  async exportToSyncthing(snapshot, { relayUrl = null, folder = "consciousness-swipe" } = {}) {
    const base = relayUrl ? relayUrl.replace(/\/$/, "") : this.baseUrl;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${base}/api/v1/consciousness/export/syncthing`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, folder }),
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const detail = await resp.text().catch(() => String(resp.status));
        throw new Error(`Syncthing export failed (${resp.status}): ${detail}`);
      }
      return resp.status === 204 ? { exported: true } : await resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Syncthing export timed out");
      throw err;
    }
  }

  /**
   * Export a snapshot to a custom HTTP endpoint (webhook).
   *
   * @param {Object} snapshot - Full SoulSnapshot payload.
   * @param {Object} config
   * @param {string} config.url   - Target URL (POST).
   * @param {string} [config.token] - Optional Bearer token for Authorization header.
   * @returns {Promise<any>} Response body (parsed JSON or {ok:true}).
   * @throws {Error} On network failure, timeout, or non-2xx response.
   */
  async exportToHttpEndpoint(snapshot, { url, token = "" } = {}) {
    if (!url) throw new Error("HTTP export: url is required");

    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const detail = await resp.text().catch(() => String(resp.status));
        throw new Error(`HTTP export failed (${resp.status}): ${detail}`);
      }
      if (resp.status === 204) return { exported: true };
      return await resp.json().catch(() => ({ exported: true }));
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("HTTP export timed out");
      throw err;
    }
  }
}
