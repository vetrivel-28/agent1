export type CategoryScopePayload = {
  mode?: string;
  selected_categories?: string[];
  category_column?: string;
  scope_key?: string;
  keyword_scope_key?: string;
  blackbox_rows_total?: number;
  blackbox_rows_active?: number;
  blackbox_rows_excluded?: number;
};

export function enrichCategoryScope(scope: CategoryScopePayload = {}): CategoryScopePayload {
  const selected = scope.selected_categories || [];
  const mode = scope.mode || (selected.length ? 'selected' : 'all');
  const scopeKey = scope.scope_key || (selected.length ? selected.join('|') : 'all');
  const keywordScopeKey =
    scope.keyword_scope_key || (scopeKey === 'all' ? 'all' : `${scopeKey}_kw`);
  return {
    ...scope,
    mode,
    selected_categories: selected,
    scope_key: scopeKey,
    keyword_scope_key: keywordScopeKey,
  };
}

export function scopeQueryKeys(statusData: { data?: { session_id?: string | number; category_scope?: CategoryScopePayload } } | undefined) {
  const categoryScope = enrichCategoryScope(statusData?.data?.category_scope || {});
  return {
    categoryScope,
    categoryKey: categoryScope.scope_key || 'all',
    keywordScopeKey: categoryScope.keyword_scope_key || 'all',
    datasetSessionId: String(statusData?.data?.session_id || 'new'),
  };
}
