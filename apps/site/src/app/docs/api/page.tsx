import Link from "next/link";
import { OPS, type OpSpec } from "@kriyan/core/ops";
import { Code } from "@/components/Code";
import { OpDescription } from "@/components/OpDescription";
import css from "@/components/Prose.module.css";
import { SITE_URL } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  path: "/docs/api",
  title: "API",
  heading: "Agent API",
  description:
    "The Kriyan agent API: one HTTP call per operation, the same operations as MCP and the CLI.",
});

// Everything below the introduction is generated from OPS in @kriyan/core/ops, the registry the
// HTTP API, the MCP server and the CLI all read, so this page can't drift from what the server accepts.

type Schema = Record<string, unknown>;

const asSchema = (value: unknown): Schema =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Schema) : {};

function range(s: Schema): string {
  const min = typeof s.minimum === "number" ? s.minimum : null;
  const max = typeof s.maximum === "number" ? s.maximum : null;
  if (min !== null && max !== null) return `, ${min} to ${max}`;
  if (min !== null) return `, at least ${min}`;
  if (max !== null) return `, at most ${max}`;
  return "";
}

function typeOf(s: Schema): string {
  if (Array.isArray(s.oneOf)) {
    const kinds = [...new Set(s.oneOf.map((option) => typeOf(asSchema(option))))];
    return kinds.join(" or ");
  }
  if ("const" in s) return JSON.stringify(s.const);
  if (Array.isArray(s.enum)) return `one of ${s.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  if (s.type === "array") return `list of ${typeOf(asSchema(s.items))}`;
  if (s.type === "integer" || s.type === "number") return `${String(s.type)}${range(s)}`;
  if (typeof s.type === "string") return s.type;
  return "any";
}

function describe(s: Schema): string {
  if (typeof s.description === "string") return s.description;
  if (Array.isArray(s.oneOf)) {
    for (const option of s.oneOf) {
      const d = asSchema(option).description;
      if (typeof d === "string") return d;
    }
  }
  return "";
}

function fields(op: OpSpec) {
  const properties = asSchema(op.input.properties);
  const required = new Set(Array.isArray(op.input.required) ? (op.input.required as string[]) : []);
  return Object.entries(properties).map(([name, schema]) => ({
    name,
    type: typeOf(asSchema(schema)),
    required: required.has(name),
    description: describe(asSchema(schema)),
  }));
}

const API = `${SITE_URL}/api/v1`;

export default function ApiDocs() {
  return (
    <article className={css.prose}>
      <h1>Agent API</h1>
      <p className={css.lede}>
        Every operation is one HTTP call. These are the same operations your AI uses over{" "}
        <Link href="/docs/mcp">MCP</Link> and the <Link href="/docs/cli">CLI</Link> runs, so anything one can
        do, the others can too.
      </p>

      <h2 id="requests">Requests</h2>
      <p>
        Send <code>POST {API}/&lt;operation&gt;</code> with a JSON object as the body and a personal access
        token from Settings in the <code>Authorization</code> header. <code>GET {API}</code> lists every
        operation with its JSON Schema.
      </p>
      <Code caption="Read today">
        {`curl -X POST ${API}/get_today \\
  -H "Authorization: Bearer $KRIYAN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{}'`}
      </Code>
      <Code caption="Add a task from a sentence">
        {`curl -X POST ${API}/add_task \\
  -H "Authorization: Bearer $KRIYAN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "essay fri 5pm #school every week remind 1h before"}'`}
      </Code>

      <h2 id="responses">Responses</h2>
      <p>
        A call that worked answers 200 with <code>{`{ "result": ... }`}</code>. Anything else answers with{" "}
        <code>{`{ "error": "..." }`}</code>, written to be shown to a person or fixed by an agent:
      </p>
      <ul>
        <li>
          <strong>400:</strong> the body isn&apos;t valid, or Kriyan refused the change. The message names the
          field.
        </li>
        <li>
          <strong>401:</strong> no token, or the token was revoked.
        </li>
        <li>
          <strong>404:</strong> there&apos;s no operation with that name.
        </li>
        <li>
          <strong>500:</strong> something failed on Kriyan&apos;s side. Try again.
        </li>
      </ul>
      <p>
        Dates are dates in your own calendar, like <code>2026-10-13</code>, and &ldquo;today&rdquo; is today
        in the time zone from your profile. Times are minutes after midnight: 14:30 is <code>870</code>.
        Lengths are minutes, and are only set when you know them.
      </p>

      <h2 id="operations">Operations</h2>
      <ul>
        {OPS.map((op) => (
          <li key={op.name}>
            <a href={`#${op.name}`}>
              <code>{op.name}</code>
            </a>
            : {op.title}
          </li>
        ))}
      </ul>

      {OPS.map((op) => {
        const rows = fields(op);
        return (
          <section key={op.name} className={css.op} aria-labelledby={op.name}>
            <h2 id={op.name}>
              <code>{op.name}</code>
            </h2>
            <p className={css.opMeta}>
              {op.title}. {op.kind === "read" ? "Reads only, never changes anything." : "Changes your plan."}
            </p>
            <p>
              <OpDescription text={op.description} />
            </p>
            {rows.length === 0 ? (
              <p>Send an empty object.</p>
            ) : (
              <div className={css.tableWrap}>
                <table className={`${css.table} ${css.fields}`}>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Type</th>
                      <th scope="col">About</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <code>{row.name}</code>
                          {row.required ? " (required)" : ""}
                        </td>
                        <td>{row.type}</td>
                        <td>
                          <OpDescription text={row.description} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}
