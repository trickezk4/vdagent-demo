/**
 * apps/gateway/src/session-store.ts
 * In-memory & disk-cached session store for message history and artifacts persistence.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ArtifactEnvelope } from '@vda/contracts';

export interface ChatMessage {
  id: string;
  session_id: string;
  agent_id: string; // e.g. 'orchestrator', 'data-agent', 'compare-agent', etc.
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifacts?: ArtifactEnvelope[];
  traceLogs?: string[];
  timestamp: string;
}

export interface SessionData {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
  artifacts: Record<string, ArtifactEnvelope>; // type or id -> ArtifactEnvelope
}

export class SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private storageFile: string;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), 'var');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
    }
    this.storageFile = path.resolve(dir, 'gateway-sessions.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const data = JSON.parse(raw);
        for (const [id, s] of Object.entries(data)) {
          this.sessions.set(id, s as SessionData);
        }
      }
    } catch (err) {
      console.warn('[SessionStore] Could not load persisted sessions:', err);
    }
  }

  private persistToDisk(): void {
    try {
      const obj: Record<string, SessionData> = {};
      for (const [id, s] of this.sessions.entries()) {
        obj[id] = s;
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch {
      // non-fatal
    }
  }

  public getOrCreateSession(sessionId: string = 'default-session'): SessionData {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        title: 'Phiên phân tích BĐS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
        artifacts: {},
      };
      this.sessions.set(sessionId, session);
      this.persistToDisk();
    }
    return session;
  }

  public addMessage(
    sessionId: string,
    agentId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    artifacts?: ArtifactEnvelope[],
    traceLogs?: string[]
  ): ChatMessage {
    const session = this.getOrCreateSession(sessionId);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      agent_id: agentId,
      role,
      content,
      artifacts: artifacts || [],
      traceLogs: traceLogs || [],
      timestamp: new Date().toISOString(),
    };
    session.messages.push(msg);
    session.updated_at = new Date().toISOString();

    // Index artifacts into session
    if (artifacts && artifacts.length > 0) {
      for (const art of artifacts) {
        session.artifacts[art.artifact_type] = art;
        session.artifacts[art.artifact_id] = art;
      }
    }

    this.persistToDisk();
    return msg;
  }

  public saveArtifact(sessionId: string, artifact: ArtifactEnvelope): void {
    const session = this.getOrCreateSession(sessionId);
    session.artifacts[artifact.artifact_type] = artifact;
    session.artifacts[artifact.artifact_id] = artifact;
    session.updated_at = new Date().toISOString();
    this.persistToDisk();
  }

  public getMessages(sessionId: string, agentId?: string): ChatMessage[] {
    const session = this.getOrCreateSession(sessionId);
    if (!agentId || agentId === 'all') {
      return session.messages;
    }
    return session.messages.filter((m) => m.agent_id === agentId);
  }

  public getArtifacts(sessionId: string): Record<string, ArtifactEnvelope> {
    const session = this.getOrCreateSession(sessionId);
    return session.artifacts;
  }

  public getArtifactById(sessionId: string, artifactId: string): ArtifactEnvelope | undefined {
    const session = this.getOrCreateSession(sessionId);
    return session.artifacts[artifactId];
  }
}

export const sessionStore = new SessionStore();
