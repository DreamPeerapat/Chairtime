/** The slice of the LINE Messaging API this app uses. */

export interface LineTextMessage {
  type: 'text';
  text: string;
  quickReply?: { items: QuickReplyItem[] };
}

export interface QuickReplyItem {
  type: 'action';
  action: { type: 'message'; label: string; text: string } | { type: 'uri'; label: string; uri: string };
}

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: FlexBubble;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

export interface FlexBubble {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
  styles?: Record<string, unknown>;
}

export interface FlexBox {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: FlexComponent[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  backgroundColor?: string;
  flex?: number;
}

export type FlexComponent = FlexBox | FlexText | FlexButton | FlexSeparator | FlexFiller;

export interface FlexText {
  type: 'text';
  text: string;
  size?: string;
  weight?: 'regular' | 'bold';
  color?: string;
  wrap?: boolean;
  align?: 'start' | 'center' | 'end';
  flex?: number;
  margin?: string;
}

export interface FlexButton {
  type: 'button';
  action: { type: 'uri'; label: string; uri: string } | { type: 'postback'; label: string; data: string };
  style?: 'primary' | 'secondary' | 'link';
  color?: string;
  height?: 'sm' | 'md';
  margin?: string;
}

export interface FlexSeparator {
  type: 'separator';
  margin?: string;
  color?: string;
}

export interface FlexFiller {
  type: 'filler';
}

/** A webhook event, narrowed to the kinds this app reacts to. */
export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  timestamp: number;
  source?: { type: string; userId?: string };
  message?: { type: string; id: string; text?: string };
  postback?: { data: string };
}

export interface LineWebhookBody {
  destination?: string;
  events: LineWebhookEvent[];
}

/**
 * The transport. Injecting this is what lets the tests assert on outgoing
 * messages without a LINE account.
 */
export interface LineClient {
  reply(replyToken: string, messages: LineMessage[]): Promise<void>;
  push(to: string, messages: LineMessage[]): Promise<void>;
}
