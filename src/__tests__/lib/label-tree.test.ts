import { describe, it, expect } from 'vitest';
import { buildLabelTree, type LabelTreeNode } from '@/lib/mail/label-tree';

/**
 * Helper: find a node by its full name (depth-first) in a tree.
 */
function findByName(
  nodes: LabelTreeNode[],
  name: string
): LabelTreeNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const inChild = findByName(n.children, name);
    if (inChild) return inChild;
  }
  return undefined;
}

describe('buildLabelTree', () => {
  it('handles flat labels (no slashes) — all roots, no children', () => {
    const labels = [
      { id: '1', name: 'Inbox', color: '#ff0000' },
      { id: '2', name: 'Sent', color: '#00ff00' },
      { id: '3', name: 'Spam', color: '#0000ff' },
    ];

    const tree = buildLabelTree(labels);

    expect(tree).toHaveLength(3);
    for (const node of tree) {
      expect(node.children).toEqual([]);
      expect(node.parentName).toBeUndefined();
    }

    const names = tree.map((n) => n.name).sort();
    expect(names).toEqual(['Inbox', 'Sent', 'Spam']);
  });

  it("groups 'Clients/Acme' under 'Clients' parent", () => {
    const labels = [
      { id: '1', name: 'Clients', color: '#aaaaaa' },
      { id: '2', name: 'Clients/Acme', color: '#bbbbbb' },
    ];

    const tree = buildLabelTree(labels);

    // Only one root: Clients
    expect(tree).toHaveLength(1);
    const clients = tree[0];
    expect(clients.name).toBe('Clients');
    expect(clients.displayName).toBe('Clients');
    expect(clients.parentName).toBeUndefined();

    // Acme is a child of Clients
    expect(clients.children).toHaveLength(1);
    const acme = clients.children[0];
    expect(acme.name).toBe('Clients/Acme');
    expect(acme.displayName).toBe('Acme');
    expect(acme.parentName).toBe('Clients');
    expect(acme.children).toEqual([]);
  });

  it("handles 3+ levels: 'Clients/Acme/Active' nests correctly", () => {
    const labels = [
      { id: '1', name: 'Clients', color: '#111111' },
      { id: '2', name: 'Clients/Acme', color: '#222222' },
      { id: '3', name: 'Clients/Acme/Active', color: '#333333' },
      { id: '4', name: 'Clients/Acme/Archived', color: '#444444' },
    ];

    const tree = buildLabelTree(labels);

    expect(tree).toHaveLength(1);
    const clients = tree[0];
    expect(clients.name).toBe('Clients');
    expect(clients.children).toHaveLength(1);

    const acme = clients.children[0];
    expect(acme.name).toBe('Clients/Acme');
    expect(acme.displayName).toBe('Acme');
    expect(acme.parentName).toBe('Clients');
    expect(acme.children).toHaveLength(2);

    // children are sorted alphabetically by displayName
    const active = acme.children[0];
    const archived = acme.children[1];
    expect(active.name).toBe('Clients/Acme/Active');
    expect(active.displayName).toBe('Active');
    expect(active.parentName).toBe('Clients/Acme');
    expect(archived.name).toBe('Clients/Acme/Archived');
    expect(archived.displayName).toBe('Archived');
    expect(archived.parentName).toBe('Clients/Acme');
  });

  it('preserves label colors', () => {
    const labels = [
      { id: '1', name: 'Clients', color: '#ff00ff' },
      { id: '2', name: 'Clients/Acme', color: '#00ffff' },
      { id: '3', name: 'Clients/Acme/Active', color: '#ffff00' },
    ];

    const tree = buildLabelTree(labels);
    const clients = findByName(tree, 'Clients');
    const acme = findByName(tree, 'Clients/Acme');
    const active = findByName(tree, 'Clients/Acme/Active');

    expect(clients?.color).toBe('#ff00ff');
    expect(acme?.color).toBe('#00ffff');
    expect(active?.color).toBe('#ffff00');
  });

  it('handles missing parents gracefully (creates ghost nodes)', () => {
    // 'Clients/Acme' exists but 'Clients' parent does NOT — should be
    // synthesised as a ghost node rather than dropping the child.
    const labels = [
      { id: '1', name: 'Clients/Acme', color: '#abcdef' },
      { id: '2', name: 'Clients/Beta', color: '#fedcba' },
    ];

    const tree = buildLabelTree(labels);

    // Single root: the ghost 'Clients'
    expect(tree).toHaveLength(1);
    const ghostClients = tree[0];
    expect(ghostClients.name).toBe('Clients');
    expect(ghostClients.displayName).toBe('Clients');
    expect(ghostClients.id).toMatch(/^__ghost__:/);
    expect(ghostClients.parentName).toBeUndefined();

    // Both real children are reattached to the ghost parent
    expect(ghostClients.children).toHaveLength(2);
    const names = ghostClients.children.map((c) => c.name).sort();
    expect(names).toEqual(['Clients/Acme', 'Clients/Beta']);

    // Real child colours are preserved through the ghost wiring
    const acme = findByName(tree, 'Clients/Acme');
    expect(acme?.color).toBe('#abcdef');
    expect(acme?.id).toBe('1');
  });

  it('handles missing intermediate parents (deep ghost chain)', () => {
    // Only the deepest leaf exists; both 'A' and 'A/B' must be ghosted.
    const labels = [
      { id: '1', name: 'A/B/C', color: '#123456' },
    ];

    const tree = buildLabelTree(labels);

    expect(tree).toHaveLength(1);
    const ghostA = tree[0];
    expect(ghostA.name).toBe('A');
    expect(ghostA.id).toMatch(/^__ghost__:/);
    expect(ghostA.children).toHaveLength(1);

    const ghostAB = ghostA.children[0];
    expect(ghostAB.name).toBe('A/B');
    expect(ghostAB.id).toMatch(/^__ghost__:/);
    expect(ghostAB.parentName).toBe('A');
    expect(ghostAB.children).toHaveLength(1);

    const real = ghostAB.children[0];
    expect(real.name).toBe('A/B/C');
    expect(real.id).toBe('1');
    expect(real.color).toBe('#123456');
    expect(real.parentName).toBe('A/B');
  });
});
