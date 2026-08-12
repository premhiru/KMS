import { describe, expect, it } from 'vitest'
import { duplicateGroups, filterContacts, mergeContacts, personalize } from './model'
import type { CrmContact } from './types'

const contact = (id:string,email:string,company='Acme'):CrmContact => ({ id, firstName:'Priya', lastName:'Raman', email, company, jobTitle:'CTO', bio:'', tags:['AI'], customFields:{}, notes:[], activity:[], eventLinks:[], createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' })
describe('CRM model',()=>{
  it('combines attribute filters with search',()=>expect(filterContacts([contact('1','a@example.com'),{...contact('2','b@example.com','Other'),firstName:'Dana'}],{query:'Priya',company:'Acme',tag:'AI'}).map((item)=>item.id)).toEqual(['1']))
  it('detects same-name contacts and preserves merged history',()=>{const first=contact('1','a@example.com');const second={...contact('2','b@example.com'),tags:['Cloud'],notes:[{id:'n',body:'Known speaker',authorName:'Jordan',createdAt:'2026-01-01T00:00:00Z'}]};expect(duplicateGroups([first,second])).toHaveLength(1);const merged=mergeContacts(first,[second]);expect(merged.tags).toEqual(['AI','Cloud']);expect(merged.notes).toHaveLength(1)})
  it('renders supported campaign merge tags',()=>expect(personalize('Hi {{first_name}} from {{company}}',contact('1','a@example.com'))).toBe('Hi Priya from Acme'))
})
