import type { AnchorHTMLAttributes } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useNavigate } from 'react-router-dom';
import './MarkdownRenderer.css';

// Allow `loadout:` URLs through sanitization. Without this, rehype-sanitize
// drops the href because it isn't in the default protocol allowlist.
const schema = {
  ...defaultSchema,
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    href: [...(defaultSchema.protocols?.href ?? []), 'loadout'],
  },
};

// react-markdown's defaultUrlTransform strips any URL whose scheme isn't in
// http/https/mailto/xmpp/ircs. Without overriding it, `loadout:N` becomes ""
// before our `a` component sees it, so the link silently falls back to an
// empty href that reloads the current page. Pass `loadout:` URLs through and
// defer to the default for everything else.
const urlTransform = (url: string) =>
  url.startsWith('loadout:') ? url : defaultUrlTransform(url);

export type LinkContext =
  | { kind: 'owner'; prefix: string }            // e.g. '/loadouts' or '/guest'
  | { kind: 'share'; folderToken: string };      // viewing inside a shared folder

interface Props {
  source: string;
  linkContext: LinkContext;
}

export function MarkdownRenderer({ source, linkContext }: Props) {
  const navigate = useNavigate();

  return (
    <div className="markdown-body">
      <ReactMarkdown
        urlTransform={urlTransform}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
            if (href && href.startsWith('loadout:')) {
              const id = parseInt(href.slice('loadout:'.length), 10);
              if (!Number.isFinite(id)) return <span>{children}</span>;
              const target = linkContext.kind === 'owner'
                ? `${linkContext.prefix}/loadout/${id}`
                : `/share/folder/${linkContext.folderToken}/${id}`;
              return (
                <a
                  href={target}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate(target);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
