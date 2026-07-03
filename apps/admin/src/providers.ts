import type { AuthProvider, DataProvider } from 'react-admin';

const TOKEN_KEY = 'cf_admin_token';

async function http(path: string, init: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error ?? res.statusText) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const { token } = await http('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: username, password }),
    });
    localStorage.setItem(TOKEN_KEY, token);
  },
  logout: async () => {
    localStorage.removeItem(TOKEN_KEY);
  },
  checkAuth: async () => {
    if (!localStorage.getItem(TOKEN_KEY)) throw new Error('not authenticated');
  },
  checkError: async (error) => {
    if ((error as { status?: number })?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      throw error;
    }
  },
  getPermissions: async () => 'admin',
};

// Тексты редактируются по ключу
function resourcePath(resource: string, id?: string | number): string {
  const base = `/api/admin/${resource}`;
  return id != null ? `${base}/${id}` : base;
}

export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const page = params.pagination?.page ?? 1;
    const perPage = params.pagination?.perPage ?? 25;
    const query = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    const filter = (params.filter ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(filter)) {
      if (v != null && v !== '') query.set(k === 'q' ? 'q' : k, String(v));
    }
    const { data, total } = await http(`${resourcePath(resource)}?${query}`);
    return { data, total };
  },
  getOne: async (resource, params) => {
    const { data } = await http(resourcePath(resource, params.id));
    return { data };
  },
  getMany: async (resource, params) => {
    // используется ReferenceInput; загружаем постранично и фильтруем
    const { data } = await http(`${resourcePath(resource)}?page=1&perPage=100`);
    return { data: data.filter((r: { id: string }) => params.ids.includes(r.id)) };
  },
  getManyReference: async () => ({ data: [], total: 0 }),
  create: async (resource, params) => {
    const { data } = await http(resourcePath(resource), {
      method: 'POST',
      body: JSON.stringify(params.data),
    });
    return { data };
  },
  update: async (resource, params) => {
    const { data } = await http(resourcePath(resource, params.id), {
      method: 'PUT',
      body: JSON.stringify(params.data),
    });
    return { data };
  },
  updateMany: async () => ({ data: [] }),
  delete: async (resource, params) => {
    const { data } = await http(resourcePath(resource, params.id), { method: 'DELETE' });
    return { data };
  },
  deleteMany: async (resource, params) => {
    for (const id of params.ids) {
      await http(resourcePath(resource, id), { method: 'DELETE' });
    }
    return { data: params.ids };
  },
};

export { http };
