#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";

// Environment configuration
const KUBECONFIG = process.env.KUBECONFIG || "";
const K8S_CONTEXT = process.env.K8S_CONTEXT || "";
const K8S_DEFAULT_NAMESPACE = process.env.K8S_DEFAULT_NAMESPACE || "default";
const KUBECTL_PATH = process.env.KUBECTL_PATH || "kubectl";

// SSH configuration for remote kubectl (optional)
const K8S_SSH_HOST = process.env.K8S_SSH_HOST || "";
const K8S_SSH_USER = process.env.K8S_SSH_USER || "";
const K8S_SSH_PASSWORD = process.env.K8S_SSH_PASSWORD || "";
const K8S_SSH_KEY = process.env.K8S_SSH_KEY || "";

interface KubectlResult {
  stdout: string;
  stderr: string;
  code: number;
}

// Execute kubectl command (locally or via SSH)
async function runKubectl(args: string[], options?: { stdin?: string }): Promise<KubectlResult> {
  return new Promise((resolve) => {
    let command: string;
    let spawnArgs: string[];

    if (K8S_SSH_HOST) {
      // Remote execution via SSH
      // Escape args properly for remote execution
      const escapedArgs = args.map(arg => {
        // Escape single quotes for shell
        if (arg.includes("'") || arg.includes(" ")) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      const kubectlCmd = `sudo kubectl ${escapedArgs.join(" ")}`;

      if (K8S_SSH_KEY) {
        // Use SSH key (preferred method)
        command = "ssh";
        spawnArgs = [
          "-i", K8S_SSH_KEY,
          "-o", "StrictHostKeyChecking=no",
          "-o", "UserKnownHostsFile=/dev/null",
          "-o", "BatchMode=yes",
          `${K8S_SSH_USER}@${K8S_SSH_HOST}`,
          kubectlCmd
        ];
      } else if (K8S_SSH_PASSWORD) {
        // Use plink (PuTTY) for password auth on Windows, or sshpass on Linux
        const isWindows = process.platform === "win32";
        if (isWindows) {
          // Try plink first (PuTTY suite)
          command = "plink";
          spawnArgs = [
            "-batch",
            "-pw", K8S_SSH_PASSWORD,
            `${K8S_SSH_USER}@${K8S_SSH_HOST}`,
            kubectlCmd
          ];
        } else {
          // Use sshpass on Linux/macOS
          command = "sshpass";
          spawnArgs = [
            "-p", K8S_SSH_PASSWORD,
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            `${K8S_SSH_USER}@${K8S_SSH_HOST}`,
            kubectlCmd
          ];
        }
      } else {
        command = "ssh";
        spawnArgs = [
          "-o", "StrictHostKeyChecking=no",
          `${K8S_SSH_USER}@${K8S_SSH_HOST}`,
          kubectlCmd
        ];
      }
    } else {
      // Local kubectl execution
      command = KUBECTL_PATH;
      spawnArgs = [...args];

      if (KUBECONFIG) {
        spawnArgs.unshift(`--kubeconfig=${KUBECONFIG}`);
      }
      if (K8S_CONTEXT) {
        spawnArgs.unshift(`--context=${K8S_CONTEXT}`);
      }
    }

    const proc = spawn(command, spawnArgs, { shell: true });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (options?.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });

    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, code: 1 });
    });
  });
}

// Helper functions
function getNamespace(namespace?: string): string {
  return namespace || K8S_DEFAULT_NAMESPACE;
}

function calculateAge(timestamp: string): string {
  if (!timestamp) return "N/A";
  const now = new Date();
  const created = new Date(timestamp);
  const diff = now.getTime() - created.getTime();

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// Tool definitions
const tools = [
  // Cluster Tools
  {
    name: "k8s_get_cluster_info",
    description: "Get Kubernetes cluster information including server version and endpoints",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "k8s_list_nodes",
    description: "List all nodes in the cluster with their status, roles, and resource information",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "k8s_get_node",
    description: "Get detailed information about a specific node",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Node name" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_describe_node",
    description: "Get full description of a node including conditions, capacity, and allocatable resources",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Node name" },
      },
      required: ["name"],
    },
  },

  // Namespace Tools
  {
    name: "k8s_list_namespaces",
    description: "List all namespaces in the cluster",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "k8s_create_namespace",
    description: "Create a new namespace",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Namespace name to create" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_delete_namespace",
    description: "Delete a namespace (WARNING: This will delete all resources in the namespace)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Namespace name to delete" },
      },
      required: ["name"],
    },
  },

  // Pod Tools
  {
    name: "k8s_list_pods",
    description: "List pods in a namespace or all namespaces",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace (omit for default namespace)" },
        all_namespaces: { type: "boolean", description: "List pods across all namespaces" },
        label_selector: { type: "string", description: "Label selector (e.g., 'app=nginx')" },
      },
    },
  },
  {
    name: "k8s_get_pod",
    description: "Get detailed information about a specific pod",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_describe_pod",
    description: "Get full description of a pod including events",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_get_pod_logs",
    description: "Get logs from a pod container",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name (if pod has multiple containers)" },
        tail: { type: "number", description: "Number of lines to show from end of logs" },
        previous: { type: "boolean", description: "Get logs from previous instance of container" },
        since: { type: "string", description: "Only return logs newer than a relative duration (e.g., 5m, 1h)" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_delete_pod",
    description: "Delete a pod",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
        force: { type: "boolean", description: "Force delete the pod immediately" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_exec_pod",
    description: "Execute a command in a pod container",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name (if pod has multiple containers)" },
        command: { type: "string", description: "Command to execute (e.g., 'ls -la' or 'cat /etc/hosts')" },
      },
      required: ["name", "command"],
    },
  },

  // Deployment Tools
  {
    name: "k8s_list_deployments",
    description: "List deployments in a namespace or all namespaces",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_deployment",
    description: "Get detailed information about a deployment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_describe_deployment",
    description: "Get full description of a deployment including events and conditions",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_scale_deployment",
    description: "Scale a deployment to a specific number of replicas",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
        replicas: { type: "number", description: "Number of replicas" },
      },
      required: ["name", "replicas"],
    },
  },
  {
    name: "k8s_restart_deployment",
    description: "Perform a rolling restart of a deployment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_update_deployment_image",
    description: "Update the container image of a deployment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name" },
        image: { type: "string", description: "New image (e.g., nginx:1.21)" },
      },
      required: ["name", "container", "image"],
    },
  },

  // Service Tools
  {
    name: "k8s_list_services",
    description: "List services in a namespace or all namespaces",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_service",
    description: "Get detailed information about a service",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_describe_service",
    description: "Get full description of a service including endpoints",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },

  // ConfigMap Tools
  {
    name: "k8s_list_configmaps",
    description: "List ConfigMaps in a namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_configmap",
    description: "Get ConfigMap details and data",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "ConfigMap name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_create_configmap",
    description: "Create a ConfigMap from literal values",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "ConfigMap name" },
        namespace: { type: "string", description: "Namespace" },
        data: { type: "object", description: "Key-value pairs for the ConfigMap" },
      },
      required: ["name", "data"],
    },
  },
  {
    name: "k8s_delete_configmap",
    description: "Delete a ConfigMap",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "ConfigMap name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },

  // Secret Tools
  {
    name: "k8s_list_secrets",
    description: "List secrets in a namespace (values are not shown)",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_secret",
    description: "Get secret metadata (values are base64 encoded)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name" },
        namespace: { type: "string", description: "Namespace" },
        decode: { type: "boolean", description: "Decode base64 values (be careful with sensitive data)" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_create_secret",
    description: "Create a generic secret from literal values",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name" },
        namespace: { type: "string", description: "Namespace" },
        data: { type: "object", description: "Key-value pairs for the secret" },
        type: { type: "string", description: "Secret type (default: generic)" },
      },
      required: ["name", "data"],
    },
  },
  {
    name: "k8s_delete_secret",
    description: "Delete a secret",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Secret name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },

  // StatefulSet Tools
  {
    name: "k8s_list_statefulsets",
    description: "List StatefulSets in a namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_statefulset",
    description: "Get StatefulSet details",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "StatefulSet name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_scale_statefulset",
    description: "Scale a StatefulSet to a specific number of replicas",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "StatefulSet name" },
        namespace: { type: "string", description: "Namespace" },
        replicas: { type: "number", description: "Number of replicas" },
      },
      required: ["name", "replicas"],
    },
  },

  // DaemonSet Tools
  {
    name: "k8s_list_daemonsets",
    description: "List DaemonSets in a namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_daemonset",
    description: "Get DaemonSet details",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "DaemonSet name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },

  // Ingress Tools
  {
    name: "k8s_list_ingresses",
    description: "List Ingresses in a namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "List across all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_ingress",
    description: "Get Ingress details",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Ingress name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },

  // Resource Management Tools
  {
    name: "k8s_apply_manifest",
    description: "Apply a YAML or JSON manifest to the cluster",
    inputSchema: {
      type: "object",
      properties: {
        manifest: { type: "string", description: "YAML or JSON manifest content" },
        namespace: { type: "string", description: "Namespace to apply to" },
        dry_run: { type: "boolean", description: "Perform a dry-run without making changes" },
      },
      required: ["manifest"],
    },
  },
  {
    name: "k8s_delete_resource",
    description: "Delete a resource by type and name",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: { type: "string", description: "Resource type (e.g., pod, deployment, service)" },
        name: { type: "string", description: "Resource name" },
        namespace: { type: "string", description: "Namespace" },
        force: { type: "boolean", description: "Force delete" },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "k8s_get_events",
    description: "Get cluster events, optionally filtered by namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace to filter events" },
        all_namespaces: { type: "boolean", description: "Get events from all namespaces" },
      },
    },
  },
  {
    name: "k8s_get_resource_yaml",
    description: "Get any resource as YAML",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: { type: "string", description: "Resource type (e.g., pod, deployment)" },
        name: { type: "string", description: "Resource name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "k8s_get_all",
    description: "Get all common resources in a namespace",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
      },
    },
  },

  // Rollout Tools
  {
    name: "k8s_rollout_status",
    description: "Get the status of a deployment rollout",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_rollout_history",
    description: "Get the rollout history of a deployment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
      },
      required: ["name"],
    },
  },
  {
    name: "k8s_rollout_undo",
    description: "Undo the last rollout of a deployment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Deployment name" },
        namespace: { type: "string", description: "Namespace" },
        revision: { type: "number", description: "Specific revision to rollback to" },
      },
      required: ["name"],
    },
  },

  // Top/Metrics Tools
  {
    name: "k8s_top_nodes",
    description: "Show resource usage (CPU/memory) for nodes",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "k8s_top_pods",
    description: "Show resource usage (CPU/memory) for pods",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace" },
        all_namespaces: { type: "boolean", description: "Show pods from all namespaces" },
      },
    },
  },

  // Context Tools
  {
    name: "k8s_get_contexts",
    description: "List all available kubectl contexts",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "k8s_current_context",
    description: "Get the current kubectl context",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Tool handler
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  const ns = getNamespace(args.namespace as string);

  switch (name) {
    // Cluster Tools
    case "k8s_get_cluster_info": {
      const result = await runKubectl(["cluster-info"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_list_nodes": {
      const result = await runKubectl(["get", "nodes", "-o", "wide"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_node": {
      const result = await runKubectl(["get", "node", args.name as string, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const node = JSON.parse(result.stdout);
      return JSON.stringify({
        name: node.metadata.name,
        labels: node.metadata.labels,
        status: node.status.conditions?.find((c: any) => c.type === "Ready")?.status === "True" ? "Ready" : "NotReady",
        conditions: node.status.conditions,
        capacity: node.status.capacity,
        allocatable: node.status.allocatable,
        nodeInfo: node.status.nodeInfo,
      }, null, 2);
    }

    case "k8s_describe_node": {
      const result = await runKubectl(["describe", "node", args.name as string]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    // Namespace Tools
    case "k8s_list_namespaces": {
      const result = await runKubectl(["get", "namespaces", "-o", "wide"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_create_namespace": {
      const result = await runKubectl(["create", "namespace", args.name as string]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Namespace '${args.name}' created successfully`;
    }

    case "k8s_delete_namespace": {
      const result = await runKubectl(["delete", "namespace", args.name as string]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Namespace '${args.name}' deleted`;
    }

    // Pod Tools
    case "k8s_list_pods": {
      const kubectlArgs = ["get", "pods", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      if (args.label_selector) {
        kubectlArgs.push("-l", args.label_selector as string);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_pod": {
      const result = await runKubectl(["get", "pod", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const pod = JSON.parse(result.stdout);
      return JSON.stringify({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        podIP: pod.status.podIP,
        nodeName: pod.spec.nodeName,
        containers: pod.spec.containers.map((c: any) => ({
          name: c.name,
          image: c.image,
          ports: c.ports,
        })),
        conditions: pod.status.conditions,
        containerStatuses: pod.status.containerStatuses,
      }, null, 2);
    }

    case "k8s_describe_pod": {
      const result = await runKubectl(["describe", "pod", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_pod_logs": {
      const kubectlArgs = ["logs", args.name as string, "-n", ns];
      if (args.container) kubectlArgs.push("-c", args.container as string);
      if (args.previous) kubectlArgs.push("--previous");
      if (args.tail) kubectlArgs.push("--tail", String(args.tail));
      if (args.since) kubectlArgs.push("--since", args.since as string);
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout || "No logs available";
    }

    case "k8s_delete_pod": {
      const kubectlArgs = ["delete", "pod", args.name as string, "-n", ns];
      if (args.force) kubectlArgs.push("--force", "--grace-period=0");
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Pod '${args.name}' deleted from namespace '${ns}'`;
    }

    case "k8s_exec_pod": {
      const kubectlArgs = ["exec", args.name as string, "-n", ns];
      if (args.container) kubectlArgs.push("-c", args.container as string);
      kubectlArgs.push("--", ...((args.command as string).split(" ")));
      const result = await runKubectl(kubectlArgs);
      return result.stdout + result.stderr;
    }

    // Deployment Tools
    case "k8s_list_deployments": {
      const kubectlArgs = ["get", "deployments", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_deployment": {
      const result = await runKubectl(["get", "deployment", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const dep = JSON.parse(result.stdout);
      return JSON.stringify({
        name: dep.metadata.name,
        namespace: dep.metadata.namespace,
        replicas: dep.spec.replicas,
        availableReplicas: dep.status.availableReplicas,
        readyReplicas: dep.status.readyReplicas,
        strategy: dep.spec.strategy,
        containers: dep.spec.template.spec.containers.map((c: any) => ({
          name: c.name,
          image: c.image,
        })),
        conditions: dep.status.conditions,
      }, null, 2);
    }

    case "k8s_describe_deployment": {
      const result = await runKubectl(["describe", "deployment", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_scale_deployment": {
      const result = await runKubectl([
        "scale", "deployment", args.name as string,
        "-n", ns,
        `--replicas=${args.replicas}`
      ]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Deployment '${args.name}' scaled to ${args.replicas} replicas`;
    }

    case "k8s_restart_deployment": {
      const result = await runKubectl(["rollout", "restart", "deployment", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Deployment '${args.name}' restarted`;
    }

    case "k8s_update_deployment_image": {
      const result = await runKubectl([
        "set", "image", `deployment/${args.name}`,
        `${args.container}=${args.image}`,
        "-n", ns
      ]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Deployment '${args.name}' container '${args.container}' updated to image '${args.image}'`;
    }

    // Service Tools
    case "k8s_list_services": {
      const kubectlArgs = ["get", "services", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_service": {
      const result = await runKubectl(["get", "service", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const svc = JSON.parse(result.stdout);
      return JSON.stringify({
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP,
        externalIPs: svc.spec.externalIPs,
        ports: svc.spec.ports,
        selector: svc.spec.selector,
      }, null, 2);
    }

    case "k8s_describe_service": {
      const result = await runKubectl(["describe", "service", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    // ConfigMap Tools
    case "k8s_list_configmaps": {
      const kubectlArgs = ["get", "configmaps"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_configmap": {
      const result = await runKubectl(["get", "configmap", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const cm = JSON.parse(result.stdout);
      return JSON.stringify({
        name: cm.metadata.name,
        namespace: cm.metadata.namespace,
        data: cm.data,
      }, null, 2);
    }

    case "k8s_create_configmap": {
      const data = args.data as Record<string, string>;
      const kubectlArgs = ["create", "configmap", args.name as string, "-n", ns];
      for (const [key, value] of Object.entries(data)) {
        kubectlArgs.push(`--from-literal=${key}=${value}`);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return `ConfigMap '${args.name}' created in namespace '${ns}'`;
    }

    case "k8s_delete_configmap": {
      const result = await runKubectl(["delete", "configmap", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `ConfigMap '${args.name}' deleted from namespace '${ns}'`;
    }

    // Secret Tools
    case "k8s_list_secrets": {
      const kubectlArgs = ["get", "secrets"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_secret": {
      const result = await runKubectl(["get", "secret", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      const secret = JSON.parse(result.stdout);
      const response: any = {
        name: secret.metadata.name,
        namespace: secret.metadata.namespace,
        type: secret.type,
        keys: Object.keys(secret.data || {}),
      };
      if (args.decode && secret.data) {
        response.decodedData = {};
        for (const [key, value] of Object.entries(secret.data)) {
          response.decodedData[key] = Buffer.from(value as string, "base64").toString("utf-8");
        }
      }
      return JSON.stringify(response, null, 2);
    }

    case "k8s_create_secret": {
      const data = args.data as Record<string, string>;
      const kubectlArgs = ["create", "secret", args.type as string || "generic", args.name as string, "-n", ns];
      for (const [key, value] of Object.entries(data)) {
        kubectlArgs.push(`--from-literal=${key}=${value}`);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Secret '${args.name}' created in namespace '${ns}'`;
    }

    case "k8s_delete_secret": {
      const result = await runKubectl(["delete", "secret", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `Secret '${args.name}' deleted from namespace '${ns}'`;
    }

    // StatefulSet Tools
    case "k8s_list_statefulsets": {
      const kubectlArgs = ["get", "statefulsets", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_statefulset": {
      const result = await runKubectl(["get", "statefulset", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return JSON.stringify(JSON.parse(result.stdout), null, 2);
    }

    case "k8s_scale_statefulset": {
      const result = await runKubectl([
        "scale", "statefulset", args.name as string,
        "-n", ns,
        `--replicas=${args.replicas}`
      ]);
      if (result.code !== 0) throw new Error(result.stderr);
      return `StatefulSet '${args.name}' scaled to ${args.replicas} replicas`;
    }

    // DaemonSet Tools
    case "k8s_list_daemonsets": {
      const kubectlArgs = ["get", "daemonsets", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_daemonset": {
      const result = await runKubectl(["get", "daemonset", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return JSON.stringify(JSON.parse(result.stdout), null, 2);
    }

    // Ingress Tools
    case "k8s_list_ingresses": {
      const kubectlArgs = ["get", "ingress", "-o", "wide"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_ingress": {
      const result = await runKubectl(["get", "ingress", args.name as string, "-n", ns, "-o", "json"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return JSON.stringify(JSON.parse(result.stdout), null, 2);
    }

    // Resource Management Tools
    case "k8s_apply_manifest": {
      const kubectlArgs = ["apply", "-f", "-"];
      if (args.namespace) kubectlArgs.push("-n", ns);
      if (args.dry_run) kubectlArgs.push("--dry-run=client");
      const result = await runKubectl(kubectlArgs, { stdin: args.manifest as string });
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout + result.stderr;
    }

    case "k8s_delete_resource": {
      const kubectlArgs = ["delete", args.resource_type as string, args.name as string, "-n", ns];
      if (args.force) kubectlArgs.push("--force", "--grace-period=0");
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return `${args.resource_type} '${args.name}' deleted from namespace '${ns}'`;
    }

    case "k8s_get_events": {
      const kubectlArgs = ["get", "events", "--sort-by=.lastTimestamp"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_resource_yaml": {
      const result = await runKubectl([
        "get", args.resource_type as string, args.name as string,
        "-n", ns, "-o", "yaml"
      ]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_get_all": {
      const result = await runKubectl(["get", "all", "-n", ns, "-o", "wide"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    // Rollout Tools
    case "k8s_rollout_status": {
      const result = await runKubectl(["rollout", "status", "deployment", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_rollout_history": {
      const result = await runKubectl(["rollout", "history", "deployment", args.name as string, "-n", ns]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_rollout_undo": {
      const kubectlArgs = ["rollout", "undo", "deployment", args.name as string, "-n", ns];
      if (args.revision) kubectlArgs.push(`--to-revision=${args.revision}`);
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    // Top/Metrics Tools
    case "k8s_top_nodes": {
      const result = await runKubectl(["top", "nodes"]);
      if (result.code !== 0) throw new Error(result.stderr || "Metrics server may not be installed");
      return result.stdout;
    }

    case "k8s_top_pods": {
      const kubectlArgs = ["top", "pods"];
      if (args.all_namespaces) {
        kubectlArgs.push("--all-namespaces");
      } else {
        kubectlArgs.push("-n", ns);
      }
      const result = await runKubectl(kubectlArgs);
      if (result.code !== 0) throw new Error(result.stderr || "Metrics server may not be installed");
      return result.stdout;
    }

    // Context Tools
    case "k8s_get_contexts": {
      const result = await runKubectl(["config", "get-contexts"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout;
    }

    case "k8s_current_context": {
      const result = await runKubectl(["config", "current-context"]);
      if (result.code !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create server
const server = new Server(
  {
    name: "kubernetes-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Main function
async function main() {
  try {
    console.error("Kubernetes MCP Server starting...");

    // Check connection mode
    if (K8S_SSH_HOST) {
      console.error(`Mode: SSH remote kubectl (${K8S_SSH_USER}@${K8S_SSH_HOST})`);
    } else {
      console.error("Mode: Local kubectl");
      if (KUBECONFIG) console.error(`Kubeconfig: ${KUBECONFIG}`);
      if (K8S_CONTEXT) console.error(`Context: ${K8S_CONTEXT}`);
    }

    // Test kubectl connectivity
    const versionResult = await runKubectl(["version", "--short"]);
    if (versionResult.code === 0) {
      console.error("kubectl connection successful");
      console.error(versionResult.stdout.trim());
    } else {
      console.error("Warning: kubectl may not be fully accessible:", versionResult.stderr);
    }

    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Kubernetes MCP server running");
  } catch (error: any) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
