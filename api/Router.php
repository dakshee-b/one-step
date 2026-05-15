<?php
declare(strict_types=1);

/**
 * Minimal regex-based router.
 *
 * Patterns use `{name}` placeholders, e.g. `/api/v1/medications/{id}`.
 * Captured params are passed to the handler as an associative array.
 *
 * Handler may be:
 *   - a closure: function (array $params): void { ... }
 *   - a [ClassName::class, 'methodName'] tuple (the class is instantiated fresh per request)
 */
class Router
{
    /** @var array<string, list<array{pattern:string, regex:string, params:list<string>, handler:mixed}>> */
    private array $routes = [];

    public function get(string $pattern, mixed $handler): void    { $this->add('GET',    $pattern, $handler); }
    public function post(string $pattern, mixed $handler): void   { $this->add('POST',   $pattern, $handler); }
    public function put(string $pattern, mixed $handler): void    { $this->add('PUT',    $pattern, $handler); }
    public function patch(string $pattern, mixed $handler): void  { $this->add('PATCH',  $pattern, $handler); }
    public function delete(string $pattern, mixed $handler): void { $this->add('DELETE', $pattern, $handler); }

    private function add(string $method, string $pattern, mixed $handler): void
    {
        $params = [];
        $regex = preg_replace_callback(
            '#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#',
            function ($m) use (&$params) {
                $params[] = $m[1];
                return '([^/]+)';
            },
            $pattern
        );
        $regex = '#^' . $regex . '$#';

        $this->routes[$method][] = [
            'pattern' => $pattern,
            'regex'   => $regex,
            'params'  => $params,
            'handler' => $handler,
        ];
    }

    public function dispatch(string $method, string $path): void
    {
        $method = strtoupper($method);

        // Exact match
        foreach ($this->routes[$method] ?? [] as $route) {
            if (preg_match($route['regex'], $path, $matches)) {
                array_shift($matches);
                $args = $route['params'] === []
                    ? []
                    : array_combine($route['params'], $matches);
                $this->invoke($route['handler'], $args);
                return;
            }
        }

        // Path exists under a different method → 405
        foreach ($this->routes as $registeredMethod => $list) {
            if ($registeredMethod === $method) {
                continue;
            }
            foreach ($list as $route) {
                if (preg_match($route['regex'], $path)) {
                    Response::error('METHOD_NOT_ALLOWED', "Method $method is not allowed for $path", 405);
                }
            }
        }

        Response::error('NOT_FOUND', "No route matches $method $path", 404);
    }

    private function invoke(mixed $handler, array $args): void
    {
        if (is_array($handler) && is_string($handler[0] ?? null)) {
            $handler = [new $handler[0](), $handler[1]];
        }
        if (!is_callable($handler)) {
            Response::error('ROUTER_MISCONFIGURED', 'Handler is not callable', 500);
        }
        $handler($args);
    }
}
