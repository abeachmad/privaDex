module.exports = {
  apps: [
    {
      name: "privadex-darkpool-autosettle",
      cwd: "/media/mdlog/mdlog/Project-MDlabs/frontend-privadex",
      script: "npm",
      args: "run darkpool:autosettle -- --state-file .darkpool/darkpool-autosettle-state.json",
      interpreter: "none",
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 20,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
