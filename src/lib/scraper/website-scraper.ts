/**
 * Website Scraper for Knowledge Base Generation
 *
 * Scrapes a business website to extract relevant information for training
 * the AI assistant with business-specific knowledge.
 */

import { isUrlAllowedAsync } from "@/lib/security/validation";

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  metadata?: {
    description?: string;
    keywords?: string[];
  };
}

export interface ScrapedWebsite {
  baseUrl: string;
  pages: ScrapedPage[];
  businessInfo: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    hours?: string[];
    services?: string[];
    about?: string;
  };
  scrapedAt: Date;
  totalPages: number;
}

export interface ScrapeOptions {
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  timeout?: number;
}

const DEFAULT_OPTIONS: ScrapeOptions = {
  maxPages: 20,
  maxDepth: 2,
  excludePatterns: [
    '/blog/',
    '/news/',
    '/press/',
    '/careers/',
    '/jobs/',
    '/privacy',
    '/terms',
    '/legal',
    '/cookie',
    '/sitemap',
    '/admin',
    '/wp-admin',
    '/login',
    '/cart',
    '/checkout',
  ],
  timeout: 30000,
};

/**
 * Extract clean text content from HTML
 */
function extractTextContent(html: string): string {
  // Remove script and style elements
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Remove navigation, header, footer elements (common noise)
  cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

  // Extract text from remaining HTML
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Try h1 as fallback
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim();
  }

  return '';
}

/**
 * Extract meta description
 */
function extractMetaDescription(html: string): string | undefined {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (match) {
    return match[1].trim();
  }

  // Try og:description as fallback
  const ogMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (ogMatch) {
    return ogMatch[1].trim();
  }

  return undefined;
}

/**
 * Extract business information from page content
 */
function extractBusinessInfo(html: string, existingInfo: ScrapedWebsite['businessInfo']): ScrapedWebsite['businessInfo'] {
  const info = { ...existingInfo };

  // Extract phone numbers (US format)
  const phonePattern = /(?:\+1[-.\s]?)?(?:\(?([0-9]{3})\)?[-.\s]?)([0-9]{3})[-.\s]?([0-9]{4})/g;
  const phones = html.match(phonePattern);
  if (phones && phones.length > 0 && !info.phone) {
    info.phone = phones[0];
  }

  // Extract email addresses
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = html.match(emailPattern);
  if (emails && emails.length > 0 && !info.email) {
    // Filter out common non-business emails
    const businessEmail = emails.find(e =>
      !e.includes('noreply') &&
      !e.includes('no-reply') &&
      !e.includes('example.com')
    );
    if (businessEmail) {
      info.email = businessEmail;
    }
  }

  return info;
}

/**
 * Extract internal links from HTML
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const linkPattern = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    let href = match[1];

    // Skip anchors, javascript, mailto, tel, and external links
    if (href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')) {
      continue;
    }

    // Convert relative URLs to absolute
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      const baseHost = new URL(baseUrl).host;
      const linkHost = new URL(absoluteUrl).host;

      // Only include same-domain links
      if (linkHost === baseHost) {
        links.push(absoluteUrl);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return [...new Set(links)]; // Remove duplicates
}

/**
 * Check if URL should be excluded based on patterns
 */
function shouldExclude(url: string, excludePatterns: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  return excludePatterns.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
}

/**
 * Fetch a single page with SSRF-safe redirect handling.
 * Redirects are followed manually so each target is validated against the
 * internal-network blocklist.
 */
async function fetchPage(url: string, timeout: number, maxRedirects = 5): Promise<string | null> {
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    try {
      // DNS-resolving SSRF check before every fetch
      if (!(await isUrlAllowedAsync(currentUrl))) {
        console.warn(`Blocked fetch to disallowed URL (DNS check): ${currentUrl}`);
        return null;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          'User-Agent': 'HolaRecep-KnowledgeBase-Bot/1.0 (AI Receptionist Setup)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(timeoutId);

      // Handle redirects manually — validate each target
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;

        const redirectUrl = new URL(location, currentUrl).href;
        if (!(await isUrlAllowedAsync(redirectUrl))) {
          console.warn(`Blocked redirect to disallowed URL: ${redirectUrl}`);
          return null;
        }
        currentUrl = redirectUrl;
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/html')) {
        return null;
      }

      return await response.text();
    } catch (error) {
      console.error(`Error fetching ${currentUrl}:`, error);
      return null;
    }
  }

  console.warn(`Too many redirects for ${url}`);
  return null;
}

function stringField(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

function stringArrayField(val: unknown): string[] | undefined {
  return Array.isArray(val) ? val.filter((item: unknown) => typeof item === 'string') : undefined;
}

/**
 * Build custom instructions string from extracted business info.
 * Returns empty string if no useful fields are present.
 */
export function buildCustomInstructionsFromBusinessInfo(
  info: ScrapedWebsite['businessInfo']
): string {
  const parts: string[] = [];
  if (info.about) parts.push(`About the business: ${info.about}`);
  if (info.services?.length) parts.push(`Services offered: ${info.services.join(", ")}`);
  if (info.hours?.length) parts.push(`Business hours:\n${info.hours.join("\n")}`);
  if (info.address) parts.push(`Business address: ${info.address}`);
  if (parts.length === 0) return "";
  return "Here is information about the business scraped from their website:\n\n" + parts.join("\n\n");
}

/**
 * Extract rich business info from scraped pages using OpenAI GPT-4.1-nano.
 * Falls back to empty object on any failure — including malformed LLM JSON
 * responses — so it is always safe to merge with regex results.
 */
export async function extractBusinessInfoWithLLM(
  pages: ScrapedPage[]
): Promise<ScrapedWebsite['businessInfo']> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[LLM Extract] OPENAI_API_KEY not set, skipping LLM extraction');
    return {};
  }

  if (pages.length === 0) return {};

  // Concatenate page text, truncated to ~8K chars
  const MAX_CHARS = 8000;
  let text = '';
  for (const page of pages) {
    const pageText = `--- ${page.title || page.url} ---\n${page.content}\n\n`;
    if (text.length + pageText.length > MAX_CHARS) {
      text += pageText.substring(0, MAX_CHARS - text.length);
      break;
    }
    text += pageText;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a business information extractor. Given website text, extract structured business details. Return a JSON object with these fields (all optional, omit if not found):
- "name": string — the business name
- "address": string — full street address
- "phone": string — primary phone number
- "email": string — primary email address
- "hours": string[] — business hours, e.g. ["Monday: 9am-5pm", "Tuesday: 9am-5pm"]
- "services": string[] — list of services offered (keep each concise, max 8 words)
- "about": string — 1-2 sentence summary of what the business does

Only include fields you are confident about. Return {} if no useful info is found.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '<unreadable>');
      console.warn(`[LLM Extract] OpenAI API returned ${response.status}:`, errorBody.substring(0, 500));
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[LLM Extract] OpenAI returned empty content', {
        finishReason: data.choices?.[0]?.finish_reason,
      });
      return {};
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[LLM Extract] Failed to parse LLM JSON output:', {
        error: parseError instanceof Error ? parseError.message : parseError,
        contentPreview: content.substring(0, 200),
      });
      return {};
    }

    // Normalize to expected shape
    return {
      name: stringField(parsed.name),
      address: stringField(parsed.address),
      phone: stringField(parsed.phone),
      email: stringField(parsed.email),
      hours: stringArrayField(parsed.hours),
      services: stringArrayField(parsed.services),
      about: stringField(parsed.about),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn('[LLM Extract] OpenAI request timed out (12s)');
    } else {
      console.warn('[LLM Extract] Network or unexpected error:', error);
    }
    return {};
  }
}

/**
 * Main scrape function
 */
export async function scrapeWebsite(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScrapedWebsite> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Normalize the base URL
  let baseUrl: string;
  try {
    const parsed = new URL(url);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    throw new Error('Invalid URL provided');
  }

  const visited = new Set<string>();
  const pages: ScrapedPage[] = [];
  const toVisit: Array<{ url: string; depth: number }> = [{ url, depth: 0 }];
  let businessInfo: ScrapedWebsite['businessInfo'] = {};

  while (toVisit.length > 0 && pages.length < (opts.maxPages || 20)) {
    const current = toVisit.shift();
    if (!current) break;

    const { url: currentUrl, depth } = current;

    // Skip if already visited or exceeds depth
    if (visited.has(currentUrl) || depth > (opts.maxDepth || 2)) {
      continue;
    }

    // Check exclusion patterns
    if (shouldExclude(currentUrl, opts.excludePatterns || [])) {
      continue;
    }

    visited.add(currentUrl);

    // SSRF protection: validate every URL before fetching (not just the initial one)
    // Uses async DNS-resolving check to prevent DNS rebinding attacks
    if (!(await isUrlAllowedAsync(currentUrl))) {
      continue;
    }

    // Fetch the page
    const html = await fetchPage(currentUrl, opts.timeout || 30000);
    if (!html) {
      continue;
    }

    // Extract content
    const title = extractTitle(html);
    const content = extractTextContent(html);
    const description = extractMetaDescription(html);

    // Skip very short pages (likely error pages or redirects)
    if (content.length < 100) {
      continue;
    }

    pages.push({
      url: currentUrl,
      title,
      content: content.substring(0, 10000), // Limit content length
      metadata: {
        description,
      },
    });

    // Extract business info
    businessInfo = extractBusinessInfo(html, businessInfo);

    // Extract links for next level (if not at max depth)
    if (depth < (opts.maxDepth || 2)) {
      const links = extractLinks(html, baseUrl);
      for (const link of links) {
        if (!visited.has(link) && !toVisit.some(t => t.url === link)) {
          toVisit.push({ url: link, depth: depth + 1 });
        }
      }
    }

    // Small delay to be respectful to the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    baseUrl,
    pages,
    businessInfo,
    scrapedAt: new Date(),
    totalPages: pages.length,
  };
}

/**
 * Generate knowledge base content from scraped website
 */
export function generateKnowledgeBase(scrapedData: ScrapedWebsite): string {
  const sections: string[] = [];

  // Business info section
  if (Object.keys(scrapedData.businessInfo).length > 0) {
    sections.push('## Business Information');
    const { name, phone, email, address, hours, services, about } = scrapedData.businessInfo;

    if (name) sections.push(`- Business Name: ${name}`);
    if (phone) sections.push(`- Phone: ${phone}`);
    if (email) sections.push(`- Email: ${email}`);
    if (address) sections.push(`- Address: ${address}`);
    if (hours && hours.length > 0) {
      sections.push(`- Business Hours:\n${hours.map(h => `  - ${h}`).join('\n')}`);
    }
    if (services && services.length > 0) {
      sections.push(`- Services:\n${services.map(s => `  - ${s}`).join('\n')}`);
    }
    if (about) sections.push(`\n### About\n${about}`);
    sections.push('');
  }

  // Page content sections
  sections.push('## Website Content');
  for (const page of scrapedData.pages) {
    sections.push(`\n### ${page.title || page.url}`);
    if (page.metadata?.description) {
      sections.push(`*${page.metadata.description}*`);
    }
    sections.push(page.content);
  }

  return sections.join('\n');
}
