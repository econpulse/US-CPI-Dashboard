# Deployment script for Posit Connect
# Run this in Posit Workbench: source("deploy.R")

if (!requireNamespace("rsconnect", quietly = TRUE)) {
  install.packages("rsconnect")
}
library(rsconnect)

# Files strictly required at browser runtime (data/ and build_data.py are excluded to stay fast & lightweight)
files_to_deploy <- c(
  "index.html",
  "styles.css",
  "chart.min.js",
  "cpi_data.js",
  "app.js",
  list.files("js", full.names = TRUE, recursive = TRUE)
)

message("Deploying US CPI Dashboard to Posit Connect...")
message("Target files count: ", length(files_to_deploy))

rsconnect::deployApp(
  appDir = ".",
  appPrimaryDoc = "index.html",
  appName = "us-cpi-dashboard",
  appTitle = "US CPI Macro Analysis Dashboard",
  appFiles = files_to_deploy,
  forceUpdate = TRUE
)
