export interface IncomingMessage {
  /** ID cua nguoi gui (user_id tren Zalo) */
  senderId: string;
  /** Ten hien thi neu Zalo tra ve */
  senderName?: string;
  /** Noi dung tin nhan dang text */
  text: string;
  /** ID hoi thoai/group, dung de tra loi dung noi */
  conversationId: string;
  /** Thoi diem nhan tin nhan (ms epoch) */
  timestamp: number;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  source: string;
  content: string;
}

export interface AnswerResult {
  answer: string;
  usedChunks: KnowledgeChunk[];
}
