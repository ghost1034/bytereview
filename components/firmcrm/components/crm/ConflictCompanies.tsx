import { useState } from 'react';
import { accountsApi } from '@/components/firmcrm/api';
import { ApiError } from '@/components/firmcrm/api/client';
import type { Account } from '@/components/firmcrm/api/types';
import { useQuery, useQueryClient } from '@/components/firmcrm/lib/query';
import { Link } from '@/components/firmcrm/lib/navigation';
import { Button, Empty, Spinner } from '@/components/firmcrm/components/ui';
import { FormModal, type FieldDef } from '@/components/firmcrm/components/ui/Form';
import { Pagination, usePager } from '@/components/firmcrm/components/ui/Pagination';
import { SearchInput } from '@/components/firmcrm/components/ui/cells';
import { useToast } from '@/components/firmcrm/components/ui/Toast';

const fields: FieldDef[] = [
  { name: 'name', label: 'Company name', required: true, span: 2,
    validate: (value) => !String(value ?? '').trim() ? 'Enter a company name.' : null },
  { name: 'aliases', label: 'Other names', span: 2,
    hint: 'Aliases or former names, separated by commas.' },
  { name: 'description', label: 'Conflict notes', type: 'textarea',
    hint: 'Relationship or restriction to review.' },
];

export function ConflictCompanyModal({ company, onClose, onSaved }: {
  company?: Account; onClose: () => void; onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return <FormModal open onClose={onClose} title={company ? 'Edit conflict company' : 'Add conflict company'}
    fields={fields} initial={company ? { name: company.name, aliases: company.aliases, description: company.description } : {}}
    submitLabel={company ? 'Save changes' : 'Add company'} onSubmit={async (values) => {
      const body = {
        name: String(values.name).trim(),
        aliases: String(values.aliases ?? '').trim() || null,
        description: String(values.description ?? '').trim() || null,
      };
      if (company) {
        await accountsApi.update(company.id, body);
      } else {
        try {
          await accountsApi.create({ ...body, account_type: 'adverse_party', entity_kind: 'company' });
        } catch (error) {
          if (error instanceof ApiError && error.code === 'duplicate') {
            throw new Error('Company already exists. In Accounts, set its Type to Adverse Party.');
          }
          throw error;
        }
      }
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      await qc.invalidateQueries({ queryKey: ['account'] });
      toast('Company saved. Run a new check to apply changes.');
      onSaved?.();
    }} />;
}

export function ConflictCompanies() {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const pager = usePager(25);
  const companies = useQuery({
    queryKey: ['accounts', 'conflict-companies', q, pager.limit, pager.offset],
    queryFn: () => accountsApi.list({ account_type: 'adverse_party', include_archived: true, q: q || undefined, limit: pager.limit, offset: pager.offset }),
  });
  return <div className="space-y-4">
    <p className="text-[13px] leading-5 text-crm-sand-600">
      Companies to screen for conflicts. Matches require review, including archived companies.
      Run a new check after edits; past decisions stay in the audit history.
    </p>
    <SearchInput aria-label="Search conflict companies" placeholder="Search company or alias…" value={q}
      onChange={(event) => { setQ(event.target.value); pager.reset(); }} />
    {companies.isError ? <div role="alert" className="card p-5 text-crm-danger-700">Could not load conflict companies. <Button onClick={() => companies.refetch()}>Retry</Button></div>
      : companies.isLoading ? <Spinner />
      : <div className="card overflow-hidden">
        {!companies.data?.items.length ? <Empty title={q ? 'No matching companies' : 'No conflict companies yet'}
          hint={q ? 'Try another company name or alias.' : 'Add a company to screen. Checks also cover accounts, contacts, and matter adverse parties.'} />
          : <ul className="divide-y divide-crm-sand-150">{companies.data.items.map((company) => <li key={company.id} className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0 break-words text-[13px] leading-5">
              <Link to={`/accounts/${company.id}`} className="font-medium">{company.name}</Link>
              {company.is_archived && <span className="ml-2 text-crm-sand-500">Archived · still screened</span>}
              {company.aliases && <p className="text-crm-sand-600">Aliases: {company.aliases}</p>}
              {company.description && <p className="whitespace-pre-wrap text-crm-sand-600">{company.description}</p>}
            </div>
            <Button size="sm" aria-label={`Edit ${company.name}`} onClick={() => setEditing(company)}>Edit</Button>
          </li>)}</ul>}
        <Pagination total={companies.data?.total} limit={pager.limit} offset={pager.offset} onOffset={pager.setOffset} onLimit={pager.setLimit} />
      </div>}
    {editing && <ConflictCompanyModal company={editing} onClose={() => setEditing(null)} />}
  </div>;
}
