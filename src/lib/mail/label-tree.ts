export interface LabelTreeNode {
  id: string;
  name: string;
  /** Display name — the last segment after the final '/' */
  displayName: string;
  color: string;
  /** Full parent name (everything before the last '/'), or undefined for roots */
  parentName?: string;
  children: LabelTreeNode[];
}

/**
 * Builds a label tree from a flat list of labels.
 *
 * Labels containing '/' are treated as nested:
 *   "Clients/Acme"  → child "Acme" under parent "Clients"
 *   "Clients/Acme/Sub" → child "Sub" under "Clients/Acme" under "Clients"
 *
 * If a parent name is implied by children but has no corresponding label
 * record, a synthetic ghost node is created (id = '__ghost__:<fullName>',
 * color = '#888888').
 */
export function buildLabelTree(
  labels: Array<{ id: string; name: string; color: string }>
): LabelTreeNode[] {
  // Index by full name for O(1) lookup
  const byName = new Map<string, LabelTreeNode>();

  // First pass: create all nodes
  for (const label of labels) {
    const segments = label.name.split('/');
    const displayName = segments[segments.length - 1];
    const parentName =
      segments.length > 1 ? segments.slice(0, -1).join('/') : undefined;

    byName.set(label.name, {
      id: label.id,
      name: label.name,
      displayName,
      color: label.color,
      parentName,
      children: [],
    });
  }

  // Ensure all implied parent paths exist (ghost nodes)
  function ensureParent(parentName: string): LabelTreeNode {
    if (byName.has(parentName)) return byName.get(parentName)!;

    const segments = parentName.split('/');
    const displayName = segments[segments.length - 1];
    const grandParentName =
      segments.length > 1 ? segments.slice(0, -1).join('/') : undefined;

    const ghost: LabelTreeNode = {
      id: `__ghost__:${parentName}`,
      name: parentName,
      displayName,
      color: '#888888',
      parentName: grandParentName,
      children: [],
    };
    byName.set(parentName, ghost);

    if (grandParentName) {
      const grandParent = ensureParent(grandParentName);
      grandParent.children.push(ghost);
    }

    return ghost;
  }

  // Second pass: wire children to parents
  const roots: LabelTreeNode[] = [];

  for (const node of byName.values()) {
    // Skip ghost nodes — they are wired during ensureParent
    if (node.id.startsWith('__ghost__:')) continue;

    if (node.parentName) {
      const parent = ensureParent(node.parentName);
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Add any ghost roots that were created but not yet in roots
  for (const node of byName.values()) {
    if (node.id.startsWith('__ghost__:') && !node.parentName) {
      if (!roots.includes(node)) roots.push(node);
    }
  }

  // Sort children alphabetically at each level
  function sortChildren(nodes: LabelTreeNode[]): void {
    nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const n of nodes) sortChildren(n.children);
  }
  sortChildren(roots);

  return roots;
}
