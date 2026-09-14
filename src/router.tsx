/* eslint-disable react-refresh/only-export-components */
import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';

type Location = {
  pathname: string;
  search: string;
  hash: string;
};

type RouterContextValue = {
  location: Location;
  navigate: (to: string, replace?: boolean) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

function readUrl() {
  return window.location.href;
}

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const url = useSyncExternalStore(subscribe, readUrl, () => '/');
  const location = useMemo(() => {
    const parsed = new URL(url);
    return {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    };
  }, [url]);

  const value = useMemo<RouterContextValue>(() => ({
    location,
    navigate: (to, replace = false) => {
      if (replace) {
        window.history.replaceState({}, '', to);
      } else {
        window.history.pushState({}, '', to);
      }
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  }), [location]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('Router hooks must be used inside BrowserRouter');
  }
  return context;
}

export function useLocation() {
  return useRouter().location;
}

export function useNavigate() {
  return useRouter().navigate;
}

type LinkProps = ComponentProps<'a'> & {
  to: string;
  replace?: boolean;
};

export function Link({ to, replace = false, onClick, ...props }: LinkProps) {
  const navigate = useNavigate();

  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && event.button === 0 &&
          !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          navigate(to, replace);
        }
      }}
    />
  );
}

type RouteProps = {
  path: string;
  element: ReactElement;
};

export function Route(_props: RouteProps) {
  void _props;
  return null;
}

type NavigateProps = {
  to: string;
  replace?: boolean;
};

export function Navigate({ to, replace = false }: NavigateProps) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, replace);
  }, [navigate, replace, to]);

  return null;
}

function matches(path: string, pathname: string) {
  return path === pathname || (path !== '/' && pathname.endsWith('/') && path === pathname.slice(0, -1));
}

export function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const routes = Children.toArray(children) as Array<ReactElement<RouteProps>>;
  const route = routes.find((candidate) => matches(candidate.props.path, pathname));
  return route?.props.element ?? null;
}
