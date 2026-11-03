import {buildTree, countHosts, groupContents} from './tree'
import type {Group, Host} from '../types'

const g = (id: string, parent = ''): Group => ({id, name: id, parent_id: parent, sort_order: 0})
const h = (id: string, group = ''): Host => ({id, label: id, hostname: id, port: 22, username: '', group_id: group, keepalive_sec: 30})

describe('buildTree', () => {
  it('nests groups and places hosts', () => {
    const t = buildTree([g('a'), g('b', 'a')], [h('1', 'a'), h('2', 'b'), h('3')])
    expect(t.roots).toHaveLength(1)
    expect(t.roots[0].children[0].group.id).toBe('b')
    expect(t.roots[0].hosts.map(x => x.id)).toEqual(['1'])
    expect(t.ungrouped.map(x => x.id)).toEqual(['3'])
    expect(countHosts(t.roots[0])).toBe(2)
  })
  it('puts hosts of unknown groups into ungrouped', () => {
    expect(buildTree([], [h('1', 'ghost')]).ungrouped).toHaveLength(1)
  })
  it('treats a group with a missing parent as a root', () => {
    expect(buildTree([g('x', 'missing')], []).roots).toHaveLength(1)
  })
})

describe('groupContents', () => {
  it('counts the groups below and the hosts in all of them', () => {
    const groups = [g('a'), g('b', 'a'), g('c', 'b'), g('d')]
    const hosts = [h('1', 'a'), h('2', 'c'), h('3', 'd'), h('4')]
    const r = groupContents(groups, hosts, 'a')
    expect(r.groups).toBe(2)
    expect(r.hosts.map(x => x.id)).toEqual(['1', '2'])
    expect(groupContents(groups, hosts, 'd')).toEqual({groups: 0, hosts: [hosts[2]]})
  })
})
