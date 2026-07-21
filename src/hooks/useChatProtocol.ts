import { useCallback, useEffect, useRef, useState } from "react";
import { CompatibleChatProtocol } from "../protocol/CompatibleChatProtocol";
import { DemoChatProtocol } from "../protocol/DemoChatProtocol";
import { createInitialProtocolState } from "../protocol/reducer";
import type {
  ChatProtocolClient,
  Frameworks,
  ProtocolState,
} from "../protocol/types";

export interface ChatConfiguration {
  mode: "demo" | "live";
  url: string;
  frameworks: Frameworks;
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
        ? new DemoChatProtocol(configuration.frameworks, onState)
        : new CompatibleChatProtocol(
            configuration.url,
            configuration.frameworks,
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
    configuration.frameworks.coaching_conversation,
    configuration.frameworks.coaching_cycle,
    configuration.frameworks.continuous_improvement,
    configuration.frameworks.teaching_framework,
    configuration.mode,
    configuration.url,
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
