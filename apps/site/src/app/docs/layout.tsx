import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { DocsNav } from "@/components/DocsNav";
import css from "./docs.module.css";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <SiteHeader current="docs" />
      <div className={css.shell}>
        <DocsNav />
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
