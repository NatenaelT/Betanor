import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldHint, FieldLabel, Input } from "@/components/ui/input";
import { Table, TableWrap } from "@/components/ui/table";

const swatches = [
  ["Navy", "--betanor-navy"], ["Blue", "--betanor-blue"], ["Electric blue", "--betanor-electric-blue"], ["Gold", "--betanor-gold"], ["Surface", "--betanor-surface"], ["Success", "--betanor-success"], ["Warning", "--betanor-warning"], ["Danger", "--betanor-danger"],
];

export default function StyleGuidePage() {
  return <main className="mx-auto max-w-7xl space-y-10 px-6 py-10 lg:px-8">
    <div>
      <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Foundation / style guide</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Betanor interface foundations</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--betanor-muted)]">Reusable primitives for the public site and internal workspace. This is a design reference, not a business module.</p>
    </div>

    <section aria-labelledby="colors-heading">
      <h2 id="colors-heading" className="text-lg font-semibold text-[var(--betanor-navy)]">Color tokens</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {swatches.map(([name, token]) => <div className="rounded-xl border border-[var(--betanor-border)] bg-white p-3" key={token}>
          <div className="h-12 rounded-lg" style={{ background: `var(${token})` }} />
          <p className="mt-2 text-xs font-semibold text-[var(--betanor-navy)]">{name}</p>
          <p className="mt-1 text-[10px] text-[var(--betanor-muted)]">{token}</p>
        </div>)}
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Actions</h2></CardHeader>
        <CardContent className="flex flex-wrap gap-3"><Button>Primary action</Button><Button variant="secondary">Gold action</Button><Button variant="outline">Secondary</Button><Button variant="ghost">Tertiary</Button><Button variant="danger">Destructive</Button></CardContent>
      </Card>
      <Card>
        <CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Status language</h2></CardHeader>
        <CardContent className="flex flex-wrap gap-3"><Badge tone="draft">Draft</Badge><Badge tone="info">In review</Badge><Badge tone="success">Approved</Badge><Badge tone="warning">Needs action</Badge><Badge tone="danger">Declined</Badge></CardContent>
      </Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Form fields</h2></CardHeader>
        <CardContent>
          <FieldLabel htmlFor="guide-email">Work email</FieldLabel>
          <Input id="guide-email" placeholder="name@betanor.et" type="email" />
          <FieldHint>Labels remain visible and guidance explains input expectations.</FieldHint>
          <div className="mt-5 flex gap-3"><Button size="sm">Save draft</Button><Button size="sm" variant="outline">Cancel</Button></div>
        </CardContent>
      </Card>
      <div className="lg:col-span-3">
        <TableWrap>
          <Table>
            <caption className="sr-only">Sample operational table styling</caption>
            <thead className="bg-slate-50 text-xs tracking-wide text-[var(--betanor-muted)] uppercase"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-5 py-3 font-semibold">Owner</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-[var(--betanor-border)]"><tr><td className="px-5 py-4 font-semibold text-[var(--betanor-navy)]">BT-0001</td><td className="px-5 py-4 text-[var(--betanor-muted)]">Workspace team</td><td className="px-5 py-4"><Badge tone="info">Planned</Badge></td></tr><tr><td className="px-5 py-4 font-semibold text-[var(--betanor-navy)]">BT-0002</td><td className="px-5 py-4 text-[var(--betanor-muted)]">Operations</td><td className="px-5 py-4"><Badge tone="draft">Draft</Badge></td></tr></tbody>
          </Table>
        </TableWrap>
      </div>
    </div>
  </main>;
}
