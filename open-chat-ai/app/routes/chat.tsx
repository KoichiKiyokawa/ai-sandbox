import { ChatContainer } from "~/components/chat/chat-container";

export function meta() {
  return [
    { title: "Open Chat AI" },
    { name: "description", content: "Chat with AI powered by Amazon Bedrock" },
  ];
}

export default function ChatRoute() {
  return <ChatContainer />;
}
