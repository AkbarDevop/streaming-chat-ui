import { useCallback, useEffect, useRef, useState } from "react";
import { CompatibleChatProtocol } from "../protocol/CompatibleChatProtocol";
import { DemoChatProtocol } from "../protocol/DemoChatProtocol";
import { createInitialProtocolState } from "../protocol/reducer";
import type {
  ChatProtocolClient,
  ProtocolState,
} from "../protocol/types";
import { DEFAULT_FRAMEWORKS } from "../protocol/types";

export interface ChatConfiguration {
  mode: "demo" | "live";
  url: string;
  username: string;
}

export function useChatProtocol(configuration: ChatConfiguration) {
  const [state, setState] = useState<ProtocolState>(createInitialProtocolState);
  const clientRef = useRef<ChatProtocolClient | null>(null);

  useEffect(() => {
    let active = true;
    const onState = (nextState: ProtocolState) => {
      if (active) setState(nextState);
    };

    const client: ChatProtocolClient =
      configuration.mode === "demo"
        ? new DemoChatProtocol(onState)
        : new CompatibleChatProtocol(
            configuration.url,
            configuration.username,
            DEFAULT_FRAMEWORKS,
            onState,
          );

    clientRef.current = client;
    client.connect();

    return () => {
      active = false;
      if (clientRef.current === client) clientRef.current = null;
      client.disconnect();
    };
  }, [
    configuration.mode,
    configuration.url,
    configuration.username,
  ]);

  const sendMessage = useCallback((content: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Chat client is not available");
    client.sendUserMessage(content);
  }, []);

  const reconnect = useCallback(() => {
    const client = clientRef.current;
    if (!client) throw new Error("Chat client is not available");
    client.connect();
  }, []);

  return { state, sendMessage, reconnect };
}
