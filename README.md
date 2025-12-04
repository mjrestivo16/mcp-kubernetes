# Kubernetes MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server that provides comprehensive Kubernetes cluster management capabilities. This server enables AI assistants like Claude to interact with Kubernetes clusters through 50 specialized tools, supporting both local kubectl and remote SSH-based execution.

## Features

### 50 Kubernetes Management Tools

This MCP server provides complete cluster management capabilities organized into the following categories:

#### Cluster Management (4 tools)
- `k8s_get_cluster_info` - Get cluster information including server version and endpoints
- `k8s_list_nodes` - List all nodes with status, roles, and resource information
- `k8s_get_node` - Get detailed information about a specific node
- `k8s_describe_node` - Get full node description including conditions and capacity

#### Namespace Management (3 tools)
- `k8s_list_namespaces` - List all namespaces in the cluster
- `k8s_create_namespace` - Create a new namespace
- `k8s_delete_namespace` - Delete a namespace (with warning)

#### Pod Management (6 tools)
- `k8s_list_pods` - List pods with filtering by namespace and labels
- `k8s_get_pod` - Get detailed pod information
- `k8s_describe_pod` - Get full pod description including events
- `k8s_get_pod_logs` - Get container logs with filtering options
- `k8s_delete_pod` - Delete a pod (with optional force)
- `k8s_exec_pod` - Execute commands in pod containers

#### Deployment Management (6 tools)
- `k8s_list_deployments` - List deployments in namespace or cluster-wide
- `k8s_get_deployment` - Get detailed deployment information
- `k8s_describe_deployment` - Get full deployment description with events
- `k8s_scale_deployment` - Scale deployment replicas
- `k8s_restart_deployment` - Perform rolling restart
- `k8s_update_deployment_image` - Update container image

#### Service Management (3 tools)
- `k8s_list_services` - List services in namespace or cluster-wide
- `k8s_get_service` - Get detailed service information
- `k8s_describe_service` - Get full service description including endpoints

#### ConfigMap Management (4 tools)
- `k8s_list_configmaps` - List ConfigMaps in namespace
- `k8s_get_configmap` - Get ConfigMap details and data
- `k8s_create_configmap` - Create ConfigMap from literal values
- `k8s_delete_configmap` - Delete a ConfigMap

#### Secret Management (4 tools)
- `k8s_list_secrets` - List secrets (values hidden)
- `k8s_get_secret` - Get secret metadata (with optional decode)
- `k8s_create_secret` - Create secret from literal values
- `k8s_delete_secret` - Delete a secret

#### StatefulSet Management (3 tools)
- `k8s_list_statefulsets` - List StatefulSets in namespace
- `k8s_get_statefulset` - Get StatefulSet details
- `k8s_scale_statefulset` - Scale StatefulSet replicas

#### DaemonSet Management (2 tools)
- `k8s_list_daemonsets` - List DaemonSets in namespace
- `k8s_get_daemonset` - Get DaemonSet details

#### Ingress Management (2 tools)
- `k8s_list_ingresses` - List Ingresses in namespace
- `k8s_get_ingress` - Get Ingress details

#### Resource Management (5 tools)
- `k8s_apply_manifest` - Apply YAML/JSON manifest to cluster
- `k8s_delete_resource` - Delete resource by type and name
- `k8s_get_events` - Get cluster events with optional filtering
- `k8s_get_resource_yaml` - Get any resource as YAML
- `k8s_get_all` - Get all common resources in namespace

#### Rollout Management (3 tools)
- `k8s_rollout_status` - Get deployment rollout status
- `k8s_rollout_history` - Get rollout history
- `k8s_rollout_undo` - Undo deployment rollout

#### Metrics & Monitoring (2 tools)
- `k8s_top_nodes` - Show node resource usage (CPU/memory)
- `k8s_top_pods` - Show pod resource usage (CPU/memory)

#### Context Management (2 tools)
- `k8s_get_contexts` - List all available kubectl contexts
- `k8s_current_context` - Get current kubectl context

## Installation

### Prerequisites

- Node.js 20 or higher
- TypeScript 5.3 or higher
- kubectl installed and configured (for local mode)
- SSH access configured (for remote mode)

### Setup

1. Clone this repository:
```bash
git clone https://github.com/yourusername/mcp-kubernetes.git
cd mcp-kubernetes
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript source:
```bash
npm run build
```

## Configuration

### Environment Variables

The server supports both local kubectl execution and remote SSH-based execution:

#### Local kubectl Mode
- `KUBECONFIG` (optional) - Path to kubeconfig file (defaults to ~/.kube/config)
- `K8S_CONTEXT` (optional) - Specific kubectl context to use
- `K8S_DEFAULT_NAMESPACE` (optional) - Default namespace (defaults to "default")
- `KUBECTL_PATH` (optional) - Path to kubectl binary (defaults to "kubectl")

#### Remote SSH Mode (for K3s or remote clusters)
- `K8S_SSH_HOST` - SSH host for remote kubectl execution (e.g., 192.168.16.100)
- `K8S_SSH_USER` - SSH username for authentication
- `K8S_SSH_KEY` - Path to SSH private key for authentication
- `K8S_SSH_PASSWORD` (alternative) - SSH password (uses plink on Windows, sshpass on Linux)
- `K8S_DEFAULT_NAMESPACE` (optional) - Default namespace (defaults to "default")

### Claude Desktop Configuration

Add to your Claude desktop configuration file (`~/.claude/config.json` or `%APPDATA%\Claude\config.json` on Windows):

#### Local kubectl:
```json
{
  "mcpServers": {
    "kubernetes": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-kubernetes/dist/index.js"],
      "env": {
        "K8S_DEFAULT_NAMESPACE": "default"
      }
    }
  }
}
```

#### Remote SSH (K3s/Raspberry Pi example):
```json
{
  "mcpServers": {
    "kubernetes": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/Administrator/mcp-servers/kubernetes/dist/index.js"],
      "env": {
        "K8S_SSH_HOST": "192.168.16.100",
        "K8S_SSH_USER": "mark",
        "K8S_SSH_KEY": "C:/Users/Administrator/.ssh/id_ed25519_k8s",
        "K8S_DEFAULT_NAMESPACE": "default"
      }
    }
  }
}
```

## Usage Examples

### List all pods in a namespace
```typescript
// Using the k8s_list_pods tool
{
  "namespace": "default"
}
```

### Get pod logs
```typescript
// Using the k8s_get_pod_logs tool
{
  "name": "my-pod",
  "namespace": "default",
  "tail": 100,
  "since": "5m"
}
```

### Scale a deployment
```typescript
// Using the k8s_scale_deployment tool
{
  "name": "my-deployment",
  "namespace": "default",
  "replicas": 3
}
```

### Apply a manifest
```typescript
// Using the k8s_apply_manifest tool
{
  "manifest": "apiVersion: v1\nkind: Pod\n...",
  "namespace": "default"
}
```

### Execute command in pod
```typescript
// Using the k8s_exec_pod tool
{
  "name": "my-pod",
  "namespace": "default",
  "command": "ls -la /app"
}
```

### Get cluster events
```typescript
// Using the k8s_get_events tool
{
  "namespace": "default"
}
```

## Development

### Running in development mode
```bash
npm run dev
```

### Building for production
```bash
npm run build
```

### Starting the server
```bash
npm start
```

## Architecture

The server uses the Model Context Protocol (MCP) to expose Kubernetes operations as tools. It supports two execution modes:

1. **Local Mode**: Executes kubectl commands directly on the local machine
2. **Remote SSH Mode**: Executes kubectl commands on a remote server via SSH (useful for K3s clusters or remote Kubernetes installations)

The server automatically detects which mode to use based on the presence of SSH environment variables.

## Use Cases

- **Raspberry Pi K3s Clusters**: Manage lightweight K3s clusters remotely
- **Development Clusters**: Quick operations on local development clusters
- **Production Monitoring**: Read-only operations for cluster health monitoring
- **GitOps Workflows**: Apply manifests and track deployments
- **Troubleshooting**: Get logs, describe resources, check events
- **Resource Management**: Create/delete ConfigMaps, Secrets, and other resources

## Security Considerations

- **SSH Key Authentication**: Prefer SSH key authentication over password-based auth
- **Read-Only Operations**: Many tools are read-only and safe for production
- **Secret Handling**: Secrets are base64 encoded by default; decode only when necessary
- **Namespace Isolation**: Use namespace parameters to limit scope of operations
- **Force Operations**: Be cautious with `force` parameters on delete operations

## Tested Environments

- **K3s on Raspberry Pi** (v1.33.5+k3s1)
- **Local Kubernetes** (minikube, kind, Docker Desktop)
- **Remote Kubernetes** via SSH

## Limitations

- Requires `kubectl` to be installed and accessible
- SSH mode requires sudo access for kubectl on remote host
- Metrics tools require metrics-server to be installed in the cluster
- Windows SSH password auth requires PuTTY's plink to be available

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/anthropics/mcp)
- Designed for use with [Claude Desktop](https://claude.ai/)
- Inspired by the Kubernetes community's kubectl tool

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Version History

- **1.0.0** - Initial release with 50 Kubernetes management tools
  - Full support for pods, deployments, services, ConfigMaps, secrets
  - StatefulSets, DaemonSets, Ingresses
  - Rollout management and metrics
  - Local and remote SSH execution modes
