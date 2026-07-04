import MarkdownIt from "markdown-it";
import type React from "react";
import { useMemo } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";

// Single shared parser. `markdown-it` (https://github.com/markdown-it/markdown-it)
// turns the assistant's Markdown reply into a token stream that we render with
// native RN <Text>/<View> components below (no HTML / WebView).
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

type Token = ReturnType<MarkdownIt["parse"]>[number];

type MdNode = {
  token: Token;
  children: MdNode[];
};

// markdown-it emits a flat list of tokens where structure is expressed via
// nesting (+1 open, -1 close, 0 self-contained). Rebuild that into a tree so we
// can render recursively.
function buildTree(tokens: Token[]): MdNode[] {
  const root: MdNode[] = [];
  const stack: MdNode[][] = [root];
  for (const token of tokens) {
    if (token.nesting === 1) {
      const node: MdNode = { token, children: [] };
      stack[stack.length - 1].push(node);
      stack.push(node.children);
    } else if (token.nesting === -1) {
      stack.pop();
    } else {
      stack[stack.length - 1].push({ token, children: [] });
    }
  }
  return root;
}

function openUrl(href: string) {
  if (!href) return;
  Linking.openURL(href).catch(() => undefined);
}

function renderInline(tokens: Token[], keyPrefix: string): React.ReactNode {
  return renderInlineNodes(buildTree(tokens), keyPrefix);
}

function renderInlineNodes(
  nodes: MdNode[],
  keyPrefix: string,
): React.ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}.${i}`;
    const t = node.token;
    switch (t.type) {
      case "text":
        return <Text key={key}>{t.content}</Text>;
      case "softbreak":
      case "hardbreak":
        return <Text key={key}>{"\n"}</Text>;
      case "code_inline":
        return (
          <Text key={key} style={styles.codeInline}>
            {t.content}
          </Text>
        );
      case "strong_open":
        return (
          <Text key={key} style={styles.strong}>
            {renderInlineNodes(node.children, key)}
          </Text>
        );
      case "em_open":
        return (
          <Text key={key} style={styles.em}>
            {renderInlineNodes(node.children, key)}
          </Text>
        );
      case "s_open":
        return (
          <Text key={key} style={styles.strike}>
            {renderInlineNodes(node.children, key)}
          </Text>
        );
      case "link_open": {
        const href = t.attrGet("href") ?? "";
        return (
          <Text key={key} style={styles.link} onPress={() => openUrl(href)}>
            {renderInlineNodes(node.children, key)}
          </Text>
        );
      }
      case "image":
        return (
          <Text key={key} style={styles.em}>
            {t.content || t.attrGet("alt") || ""}
          </Text>
        );
      default:
        return node.children.length
          ? renderInlineNodes(node.children, key)
          : null;
    }
  });
}

function inlineChildrenOf(node: MdNode): Token[] {
  const inline = node.children.find((c) => c.token.type === "inline");
  return inline?.token.children ?? [];
}

function headingStyle(tag: string) {
  switch (tag) {
    case "h1":
      return styles.h1;
    case "h2":
      return styles.h2;
    case "h3":
      return styles.h3;
    default:
      return styles.h4;
  }
}

function renderListItem(
  node: MdNode,
  key: string,
  marker: string,
): React.ReactNode {
  return (
    <View key={key} style={styles.listItem}>
      <Text style={styles.listMarker}>{marker}</Text>
      <View style={styles.listItemContent}>
        {renderBlockNodes(node.children, key)}
      </View>
    </View>
  );
}

function cellAlign(node: MdNode): "left" | "center" | "right" {
  // markdown-it encodes column alignment as an inline `style="text-align:..."`
  // attribute on each th/td token.
  const style = node.token.attrGet("style") ?? "";
  if (style.includes("center")) return "center";
  if (style.includes("right")) return "right";
  return "left";
}

function renderTableCell(
  node: MdNode,
  key: string,
  isHeader: boolean,
): React.ReactNode {
  const align = cellAlign(node);
  return (
    <View key={key} style={styles.tableCell}>
      <Text
        style={[
          isHeader ? styles.tableHeaderText : styles.tableCellText,
          { textAlign: align },
        ]}>
        {renderInline(inlineChildrenOf(node), key)}
      </Text>
    </View>
  );
}

function renderTableRow(
  row: MdNode,
  key: string,
  isHeader: boolean,
): React.ReactNode {
  return (
    <View
      key={key}
      style={[styles.tableRow, isHeader && styles.tableHeaderRow]}>
      {row.children.map((cell, i) =>
        renderTableCell(cell, `${key}.${i}`, isHeader),
      )}
    </View>
  );
}

function renderTable(node: MdNode, key: string): React.ReactNode {
  const rows: React.ReactNode[] = [];
  node.children.forEach((section, si) => {
    const isHeader = section.token.type === "thead_open";
    section.children.forEach((row, ri) => {
      rows.push(renderTableRow(row, `${key}.${si}.${ri}`, isHeader));
    });
  });
  return (
    <View key={key} style={styles.table}>
      {rows}
    </View>
  );
}

function renderBlockNodes(
  nodes: MdNode[],
  keyPrefix: string,
): React.ReactNode[] {
  return nodes
    .map((node, i) => renderBlockNode(node, `${keyPrefix}.${i}`))
    .filter((n): n is React.ReactElement => n != null);
}

function renderBlockNode(node: MdNode, key: string): React.ReactNode {
  const t = node.token;
  switch (t.type) {
    case "heading_open":
      return (
        <Text key={key} style={headingStyle(t.tag)}>
          {renderInline(inlineChildrenOf(node), key)}
        </Text>
      );
    case "paragraph_open":
      return (
        <Text key={key} style={styles.paragraph}>
          {renderInline(inlineChildrenOf(node), key)}
        </Text>
      );
    case "fence":
    case "code_block":
      return (
        <View key={key} style={styles.codeBlock}>
          <Text style={styles.codeBlockText}>
            {t.content.replace(/\n$/, "")}
          </Text>
        </View>
      );
    case "bullet_list_open":
      return (
        <View key={key} style={styles.list}>
          {node.children.map((li, idx) =>
            renderListItem(li, `${key}.${idx}`, "\u2022"),
          )}
        </View>
      );
    case "ordered_list_open": {
      const start = Number(t.attrGet("start") ?? 1) || 1;
      return (
        <View key={key} style={styles.list}>
          {node.children.map((li, idx) =>
            renderListItem(li, `${key}.${idx}`, `${start + idx}.`),
          )}
        </View>
      );
    }
    case "blockquote_open":
      return (
        <View key={key} style={styles.blockquote}>
          {renderBlockNodes(node.children, key)}
        </View>
      );
    case "table_open":
      return renderTable(node, key);
    case "hr":
      return <View key={key} style={styles.hr} />;
    case "inline":
      return (
        <Text key={key} style={styles.paragraph}>
          {renderInline(t.children ?? [], key)}
        </Text>
      );
    default:
      return node.children.length ? (
        <View key={key}>{renderBlockNodes(node.children, key)}</View>
      ) : null;
  }
}

type MarkdownMessageProps = {
  content: string;
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const tree = useMemo(() => buildTree(md.parse(content ?? "", {})), [content]);
  return <View style={styles.root}>{renderBlockNodes(tree, "md")}</View>;
}

const BASE_COLOR = "#202124";
const BASE_SIZE = 15;
const BASE_LINE = 22;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const styles = StyleSheet.create({
  root: {
    rowGap: 10,
  },
  paragraph: {
    color: BASE_COLOR,
    fontSize: BASE_SIZE,
    lineHeight: BASE_LINE,
  },
  strong: {
    fontWeight: "700",
  },
  em: {
    fontStyle: "italic",
  },
  strike: {
    textDecorationLine: "line-through",
  },
  link: {
    color: "#1A73E8",
    textDecorationLine: "underline",
  },
  h1: {
    color: BASE_COLOR,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  h2: {
    color: BASE_COLOR,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 25,
  },
  h3: {
    color: BASE_COLOR,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23,
  },
  h4: {
    color: BASE_COLOR,
    fontSize: BASE_SIZE,
    fontWeight: "700",
    lineHeight: BASE_LINE,
  },
  codeInline: {
    backgroundColor: "#F1F3F4",
    color: "#37474F",
    fontFamily: MONO,
    fontSize: 13.5,
  },
  codeBlock: {
    backgroundColor: "#F1F3F4",
    borderColor: "#E1E5EA",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  codeBlockText: {
    color: "#263238",
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 19,
  },
  list: {
    rowGap: 4,
  },
  listItem: {
    columnGap: 8,
    flexDirection: "row",
  },
  listMarker: {
    color: BASE_COLOR,
    fontSize: BASE_SIZE,
    lineHeight: BASE_LINE,
    minWidth: 16,
  },
  listItemContent: {
    flex: 1,
    rowGap: 4,
  },
  blockquote: {
    borderLeftColor: "#D2E3FC",
    borderLeftWidth: 3,
    paddingLeft: 12,
    rowGap: 8,
  },
  hr: {
    backgroundColor: "#E8EAED",
    height: 1,
  },
  table: {
    borderColor: "#E1E5EA",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableRow: {
    borderTopColor: "#E8EAED",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  tableHeaderRow: {
    backgroundColor: "#F1F3F4",
    borderTopWidth: 0,
  },
  tableCell: {
    borderLeftColor: "#E8EAED",
    borderLeftWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableHeaderText: {
    color: BASE_COLOR,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  tableCellText: {
    color: BASE_COLOR,
    fontSize: 13,
    lineHeight: 18,
  },
});
