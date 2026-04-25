// Tool icons mapping
export const TOOL_ICONS: Record<string, string> = {
  terminal: 'terminal',
  search_files: 'search',
  read_file: 'description',
  write_file: 'edit_document',
  edit_file: 'edit_note',
  glob: 'search',
  grep: 'find_in_page',
  web_search: 'travel_explore',
  web_fetch: 'cloud_download',
  skill: 'auto_awesome',
};

// Session search result type
export interface SessionSearchResult {
  session_id: string;
  title: string | null;
  source: string;
  started_at: number;
  last_active: number;
  message_count: number;
  preview: string;
}

export interface SessionSearchResponse {
  success: boolean;
  mode: string;
  results: SessionSearchResult[];
  count: number;
  message: string;
}
