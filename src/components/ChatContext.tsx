"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  images?: string[];
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  compactedSummary?: string | null;
  compactedAtIndex?: number | null;
};

type ChatContextType = {
  chats: ChatSession[];
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  createChat: () => string;
  addMessageToChat: (chatId: string, message: Message) => void;
  updateMessageInChat: (chatId: string, messageId: string, content: string) => void;
  deleteChat: (chatId: string) => void;
  compactChat: (chatId: string, summary: string, atIndex: number) => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [botName, setBotName] = useState("Eddy");

  // Fetch bot name
  useEffect(() => {
    fetch("/api/botname")
      .then(r => r.json())
      .then(d => { if (d.name) setBotName(d.name); })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch("/api/chats")
      .then((res) => res.json())
      .then(async (parsedChats) => {
        // Fetch messages for each chat
        const chatsWithMessages = await Promise.all(
          parsedChats.map(async (chat: ChatSession) => {
            try {
              const msgRes = await fetch(`/api/chats/${chat.id}/messages`);
              const messages = await msgRes.json();
              return { ...chat, messages: Array.isArray(messages) ? messages : [] };
            } catch {
              return { ...chat, messages: [] };
            }
          })
        );
        setChats(chatsWithMessages);
        if (chatsWithMessages.length > 0) {
          const mostRecent = [...chatsWithMessages].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          setActiveChatId(mostRecent.id);
        }
        setHasLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to fetch chats from API", e);
        setHasLoaded(true);
      });
  }, []);

  const createChat = () => {
    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [
        { id: Date.now().toString(), role: "ai", content: `Hello! I'm ${botName}. How can I help you today?` }
      ],
      updatedAt: Date.now(),
      compactedSummary: null,
      compactedAtIndex: null,
    };

    fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newChat.id, title: newChat.title, updatedAt: newChat.updatedAt }),
    }).then(() => {
      fetch(`/api/chats/${newChat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newChat.messages[0], timestamp: Date.now() }),
      });
    });

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    return newChat.id;
  };

  const addMessageToChat = (chatId: string, message: Message) => {
    fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, timestamp: Date.now() }),
    });

    setChats((prev) => {
      return prev.map((chat) => {
        if (chat.id === chatId) {
          const updatedMessages = [...(chat.messages || []), message];
          let newTitle = chat.title;
          let titleChanged = false;
          if (chat.title === "New Chat" && message.role === "user") {
            newTitle = message.content.substring(0, 25);
            if (message.content.length > 25) newTitle += "...";
            titleChanged = true;
          }

          if (titleChanged) {
            fetch(`/api/chats/${chatId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle, updatedAt: Date.now() }),
            });
          }

          return {
            ...chat,
            title: newTitle,
            messages: updatedMessages,
            updatedAt: Date.now()
          };
        }
        return chat;
      }).sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const updateMessageInChat = (chatId: string, messageId: string, content: string) => {
    setChats((prev) => {
      return prev.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            messages: chat.messages.map((msg) =>
              msg.id === messageId ? { ...msg, content } : msg
            ),
          };
        }
        return chat;
      });
    });
  };

  const compactChat = (chatId: string, summary: string, atIndex: number) => {
    // Persist to DB
    fetch(`/api/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compactedSummary: summary, compactedAtIndex: atIndex, updatedAt: Date.now() }),
    });

    // Update in-memory state
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, compactedSummary: summary, compactedAtIndex: atIndex, updatedAt: Date.now() }
          : chat
      )
    );
  };

  const deleteChat = (chatId: string) => {
    fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  if (!hasLoaded) {
    return null; // Avoid hydration mismatch
  }

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChatId,
        setActiveChatId,
        createChat,
        addMessageToChat,
        updateMessageInChat,
        deleteChat,
        compactChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
