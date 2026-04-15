import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <div className="relative">
      <div className="w-12 h-12 border-4 border-purple-200 rounded-full animate-spin border-t-purple-600"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 rounded-full animate-pulse border-t-blue-600 opacity-50"></div>
      </div>
    </div>
    <p className="mt-4 text-gray-600 font-medium">Verifying authentication...</p>
    <p className="mt-2 text-sm text-gray-400">Please wait</p>
  </div>
);

// Access denied component
const AccessDenied = ({ requiredRoles, requiredPermissions, redirectTo }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">
          You don't have permission to access this page.
          {requiredRoles && requiredRoles.length > 0 && (
            <span className="block text-sm mt-2">
              Required roles: {requiredRoles.join(', ')}
            </span>
          )}
          {requiredPermissions && requiredPermissions.length > 0 && (
            <span className="block text-sm mt-2">
              Required permissions: {requiredPermissions.join(', ')}
            </span>
          )}
        </p>
        <div className="space-x-4">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
          >
            Go Back
          </button>
          <button
            onClick={() => window.location.href = redirectTo || '/'}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Protected Route Component
 * Ensures user is authenticated before accessing route
 */
export default function ProtectedRoute({ 
  children, 
  requiredRoles = null, 
  requiredPermissions = null,
  redirectTo = '/login',
  fallbackPath = '/dashboard'
}) {
  const { isAuthenticated, loading, hasRole, hasPermission } = useAuth();
  const location = useLocation();
  const needsAuthorizationCheck = Boolean(requiredRoles || requiredPermissions);
  let hasAccess = true;

  if (needsAuthorizationCheck) {
    const roleCheck = requiredRoles && requiredRoles.length > 0 ? hasRole(requiredRoles) : true;
    const permissionCheck = requiredPermissions && requiredPermissions.length > 0
      ? requiredPermissions.every((perm) => hasPermission(perm))
      : true;
    hasAccess = roleCheck && permissionCheck;
  }

  // Show loading spinner while checking auth
  if (loading) {
    return <LoadingSpinner />;
  }

  // Not authenticated - redirect to login with return URL
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Authenticated but doesn't have required roles/permissions
  if (needsAuthorizationCheck && !hasAccess) {
    return <AccessDenied 
      requiredRoles={requiredRoles} 
      requiredPermissions={requiredPermissions}
      redirectTo={fallbackPath}
    />;
  }

  // Authenticated and authorized - render children
  return children;
}

/**
 * Route guard for specific roles
 * @param {Object} props - Component props
 * @param {Array} props.roles - Array of allowed roles
 * @param {React.ReactNode} props.children - Child components
 * @param {string} props.redirectTo - Redirect path if unauthorized
 */
export const RoleBasedRoute = ({ roles, children, redirectTo = '/dashboard' }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!roles.includes(user?.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

/**
 * Route guard for specific permissions
 * @param {Object} props - Component props
 * @param {Array} props.permissions - Array of required permissions
 * @param {React.ReactNode} props.children - Child components
 * @param {string} props.redirectTo - Redirect path if unauthorized
 */
export const PermissionBasedRoute = ({ permissions, children, redirectTo = '/dashboard' }) => {
  const { isAuthenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const hasAllPermissions = permissions.every(perm => hasPermission(perm));

  if (!hasAllPermissions) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

/**
 * Public only route - redirects to dashboard if already authenticated
 * Useful for login/register pages
 */
export const PublicOnlyRoute = ({ children, redirectTo = '/dashboard' }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
    // Redirect to the page they tried to visit or dashboard
    const from = location.state?.from?.pathname || redirectTo;
    return <Navigate to={from} replace />;
  }

  return children;
};

/**
 * Conditional route - shows different content based on auth status
 */
export const ConditionalRoute = ({ 
  authenticatedComponent, 
  unauthenticatedComponent,
  requiredRoles = null,
  requiredPermissions = null 
}) => {
  const { isAuthenticated, loading, hasRole, hasPermission } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!isAuthenticated) {
    return unauthenticatedComponent;
  }
  
  // Check roles/permissions for authenticated users
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasRole(requiredRoles)) {
      return unauthenticatedComponent;
    }
  }
  
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every(perm => hasPermission(perm));
    if (!hasAllPermissions) {
      return unauthenticatedComponent;
    }
  }
  
  return authenticatedComponent;
};

export { LoadingSpinner, AccessDenied };
