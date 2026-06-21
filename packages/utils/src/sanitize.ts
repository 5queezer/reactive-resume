import type { Config } from "dompurify";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
	"p",
	"br",
	"hr",
	"span",
	"div",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"strike",
	"mark",
	"code",
	"pre",
	"ul",
	"ol",
	"li",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
	"colgroup",
	"col",
	"a",
	"blockquote",
];

const ALLOWED_ATTR = ["class", "style", "href", "target", "rel", "colspan", "rowspan", "data-type", "data-label"];

const ALLOWED_TAG_SET = new Set(ALLOWED_TAGS);
const ALLOWED_ATTR_SET = new Set(ALLOWED_ATTR);
const DROP_CONTENT_TAGS = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"svg",
	"math",
	"meta",
	"link",
	"base",
]);
const SAFE_TARGETS = new Set(["_blank", "_self", "_parent", "_top"]);

const PLAIN_TEXT_SANITIZE_CONFIG: Config = {
	ALLOWED_TAGS: [],
	ALLOWED_ATTR: [],
	KEEP_CONTENT: true,
	RETURN_TRUSTED_TYPE: false,
};

function sanitizePlainTextContent(value: string): string {
	const sanitized = DOMPurify.sanitize(value, PLAIN_TEXT_SANITIZE_CONFIG);

	if (typeof sanitized === "string") return sanitized;

	return value.replace(/<[^>]*>/g, "");
}

function stripCssComments(value: string): string {
	if (!value) return "";

	return value.replace(/\/\*[\s\S]*?\*\//g, "");
}

function decodeCssEscapes(value: string): string {
	if (!value) return "";

	return value.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|\\(.)/g, (_match, hex, escapedChar) => {
		if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
		return escapedChar ?? "";
	});
}

function getHtmlDocument(): Document | undefined {
	if (typeof document !== "undefined" && typeof document.createElement === "function") return document;

	return globalThis.window?.document;
}

function stripControlCharactersAndWhitespace(value: string): string {
	return Array.from(value)
		.filter((char) => {
			const codePoint = char.codePointAt(0);

			return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f && !/\s/.test(char);
		})
		.join("");
}

function isUnsafeUrl(value: string): boolean {
	const normalized = stripControlCharactersAndWhitespace(value).toLowerCase();

	return /^(?:javascript|data|vbscript):/.test(normalized);
}

function sanitizeHref(value: string): string | undefined {
	const trimmed = value.trim();

	if (!trimmed || isUnsafeUrl(trimmed)) return undefined;

	return trimmed;
}

function sanitizeAttributeValue(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeElementAttributes(element: Element): void {
	for (const attribute of Array.from(element.attributes)) {
		const name = attribute.name.toLowerCase();

		if (!ALLOWED_ATTR_SET.has(name) || name.startsWith("on")) {
			element.removeAttribute(attribute.name);
			continue;
		}

		if (name === "href") {
			const safeHref = sanitizeHref(attribute.value);

			if (!safeHref) element.removeAttribute(attribute.name);
			else element.setAttribute(attribute.name, safeHref);

			continue;
		}

		if (name === "style") {
			const safeStyle = sanitizeCss(attribute.value).trim();

			if (!safeStyle) element.removeAttribute(attribute.name);
			else element.setAttribute(attribute.name, safeStyle);

			continue;
		}

		if (name === "target" && !SAFE_TARGETS.has(attribute.value)) {
			element.removeAttribute(attribute.name);
		}
	}
}

function sanitizeChildNodes(parent: Node): void {
	for (const child of Array.from(parent.childNodes)) {
		if (child.nodeType === Node.COMMENT_NODE) {
			child.parentNode?.removeChild(child);
			continue;
		}

		if (child.nodeType !== Node.ELEMENT_NODE) continue;

		const element = child as Element;
		const tagName = element.tagName.toLowerCase();

		if (DROP_CONTENT_TAGS.has(tagName)) {
			element.remove();
			continue;
		}

		if (!ALLOWED_TAG_SET.has(tagName)) {
			sanitizeChildNodes(element);

			while (element.firstChild) parent.insertBefore(element.firstChild, element);

			element.remove();
			continue;
		}

		sanitizeElementAttributes(element);
		sanitizeChildNodes(element);
	}
}

function sanitizeAttributesFallback(attributes: string): string {
	const sanitizedAttributes: string[] = [];
	const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

	for (const match of attributes.matchAll(attributePattern)) {
		const rawName = match[1];
		if (!rawName) continue;

		const name = rawName.toLowerCase();
		const value = match[3] ?? match[4] ?? match[5] ?? "";

		if (!ALLOWED_ATTR_SET.has(name) || name.startsWith("on")) continue;

		if (name === "href") {
			const safeHref = sanitizeHref(value);
			if (!safeHref) continue;

			sanitizedAttributes.push(`${name}="${sanitizeAttributeValue(safeHref)}"`);
			continue;
		}

		if (name === "style") {
			const safeStyle = sanitizeCss(value).trim();
			if (!safeStyle) continue;

			sanitizedAttributes.push(`${name}="${sanitizeAttributeValue(safeStyle)}"`);
			continue;
		}

		if (name === "target" && !SAFE_TARGETS.has(value)) continue;

		sanitizedAttributes.push(`${name}="${sanitizeAttributeValue(value)}"`);
	}

	return sanitizedAttributes.length > 0 ? ` ${sanitizedAttributes.join(" ")}` : "";
}

function sanitizeHtmlFallback(html: string): string {
	const dropTags = Array.from(DROP_CONTENT_TAGS).join("|");
	const dropTagPattern = new RegExp(`<\\s*(${dropTags})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, "gi");
	const selfClosingDropTagPattern = new RegExp(`<\\s*\\/?\\s*(?:${dropTags})\\b[^>]*\\/?>`, "gi");

	return html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(dropTagPattern, "")
		.replace(selfClosingDropTagPattern, "")
		.replace(
			/<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g,
			(_match, closingSlash: string, rawTagName: string, attributes: string) => {
				const tagName = rawTagName.toLowerCase();

				if (!ALLOWED_TAG_SET.has(tagName)) return "";
				if (closingSlash) return `</${tagName}>`;

				return `<${tagName}${sanitizeAttributesFallback(attributes)}>`;
			},
		);
}

export function sanitizeHtml(html: string): string {
	if (!html) return "";

	const document = getHtmlDocument();

	if (!document) return sanitizeHtmlFallback(html);

	const template = document.createElement("template");
	template.innerHTML = html;
	sanitizeChildNodes(template.content);

	return template.innerHTML;
}

export function sanitizeCss(css: string): string {
	if (!css) return "";

	const normalized = decodeCssEscapes(stripCssComments(css));
	const preSanitized = normalized
		.replace(/javascript\s*:/gi, "")
		.replace(/expression\s*\(/gi, "")
		.replace(/behavior\s*:[^;}]*/gi, "")
		.replace(/-moz-binding\s*:[^;}]*/gi, "");

	const sanitized = preSanitized
		.replace(/@import[^;]*;/gi, "")
		.replace(/@font-face\s*\{[^}]*\}/gi, "")
		.replace(/\b(?:url|image-set|cross-fade)\s*\([^)]*\)/gi, "")
		.replace(/^\s*src\s*:[^;]*;?/gim, "");

	return sanitizePlainTextContent(sanitized);
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
