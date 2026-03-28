#!/bin/bash
# Deploy new contract versions to Aleo testnet
# This script: copies → renames → updates refs → builds → deploys
set -e

CONTRACTS_DIR="/media/mdlog/mdlog/Project-MDlabs/frontend-privadex/contracts"
PRIVATE_KEY="APrivateKey1zkp3PXm3fMSgNM9kmS6M2MQP73Ca8M52o4SxRNVYSKh4eyd"
RPC="https://api.explorer.provable.com/v1"
FEE=5000000  # 5 ALEO per deploy

# ─── Version mapping (old → new) ─────────────────────────────────────────
declare -A NAME_MAP=(
  ["privadex_amm_v7"]="privadex_amm_v8"
  ["privadex_amm_btcx_v3"]="privadex_amm_btcx_v4"
  ["privadex_amm_ethx_v3"]="privadex_amm_ethx_v4"
  ["privadex_amm_native_btcx_v3"]="privadex_amm_native_btcx_v5"
  ["privadex_amm_native_ethx_v3"]="privadex_amm_native_ethx_v5"
  ["privadex_amm_btcx_ethx_v3"]="privadex_amm_btcx_ethx_v4"
  ["privadex_darkpool_v3"]="privadex_darkpool_v4"
  ["privadex_orderbook_v3"]="privadex_orderbook_v4"
  ["privadex_token"]="privadex_token_v2"
  ["privadex_router"]="privadex_router_v2"
)

# Deploy order: standalone first, then dependent contracts
DEPLOY_ORDER=(
  "privadex_token"
  "privadex_amm_v7"
  "privadex_amm_btcx_v3"
  "privadex_amm_ethx_v3"
  "privadex_amm_native_btcx_v3"
  "privadex_amm_native_ethx_v3"
  "privadex_amm_btcx_ethx_v3"
  "privadex_orderbook_v3"
  "privadex_darkpool_v3"
  "privadex_router"
)

echo "═══════════════════════════════════════════════════════════════"
echo " PrivaDEX Contract Deployment — New Versions"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Phase 1: Copy and rename ──────────────────────────────────────────
echo "Phase 1: Setting up new version directories..."
for old in "${DEPLOY_ORDER[@]}"; do
  new="${NAME_MAP[$old]}"
  old_dir="$CONTRACTS_DIR/$old"
  new_dir="$CONTRACTS_DIR/$new"

  if [ -d "$new_dir" ]; then
    echo "  [SKIP] $new_dir already exists"
    continue
  fi

  echo "  [COPY] $old → $new"
  cp -r "$old_dir" "$new_dir"

  # Update program name in program.json
  sed -i "s/\"${old}.aleo\"/\"${new}.aleo\"/g" "$new_dir/program.json"

  # Update program name in main.leo source
  if [ -f "$new_dir/src/main.leo" ]; then
    sed -i "s/program ${old}.aleo/program ${new}.aleo/g" "$new_dir/src/main.leo"
  fi
done

# ─── Phase 1b: Update cross-references in dependent contracts ──────────
echo ""
echo "Phase 1b: Updating cross-references..."

# Darkpool depends on AMM
DARKPOOL_NEW="${NAME_MAP["privadex_darkpool_v3"]}"
if [ -d "$CONTRACTS_DIR/$DARKPOOL_NEW" ]; then
  echo "  [REF] $DARKPOOL_NEW: privadex_amm_v7 → privadex_amm_v8"
  sed -i "s/privadex_amm_v7\.aleo/privadex_amm_v8.aleo/g" "$CONTRACTS_DIR/$DARKPOOL_NEW/src/main.leo"
  sed -i "s/privadex_amm_v7\.aleo/privadex_amm_v8.aleo/g" "$CONTRACTS_DIR/$DARKPOOL_NEW/program.json"
  # Update local path reference
  sed -i "s|../privadex_amm_v7|../privadex_amm_v8|g" "$CONTRACTS_DIR/$DARKPOOL_NEW/program.json"
fi

# Router depends on 3 AMM pools
ROUTER_NEW="${NAME_MAP["privadex_router"]}"
if [ -d "$CONTRACTS_DIR/$ROUTER_NEW" ]; then
  for old_dep in privadex_amm_native_btcx_v3 privadex_amm_native_ethx_v3 privadex_amm_btcx_ethx_v3; do
    new_dep="${NAME_MAP[$old_dep]}"
    echo "  [REF] $ROUTER_NEW: $old_dep → $new_dep"
    sed -i "s/${old_dep}\.aleo/${new_dep}.aleo/g" "$CONTRACTS_DIR/$ROUTER_NEW/src/main.leo"
    sed -i "s/${old_dep}\.aleo/${new_dep}.aleo/g" "$CONTRACTS_DIR/$ROUTER_NEW/program.json"
    sed -i "s|../${old_dep}|../${new_dep}|g" "$CONTRACTS_DIR/$ROUTER_NEW/program.json"
  done
fi

echo ""
echo "Phase 1 complete. New directories created."
echo ""

# ─── Phase 2: Build ────────────────────────────────────────────────────
echo "Phase 2: Building contracts..."
BUILD_FAILED=()
for old in "${DEPLOY_ORDER[@]}"; do
  new="${NAME_MAP[$old]}"
  new_dir="$CONTRACTS_DIR/$new"

  echo "  [BUILD] $new..."
  cd "$new_dir"
  # Remove old build artifacts
  rm -rf build/
  if leo build 2>&1 | tail -3; then
    echo "  [OK] $new built successfully"
  else
    echo "  [FAIL] $new build failed!"
    BUILD_FAILED+=("$new")
  fi
done

if [ ${#BUILD_FAILED[@]} -gt 0 ]; then
  echo ""
  echo "BUILD FAILURES: ${BUILD_FAILED[*]}"
  echo "Fix build errors before deploying."
  exit 1
fi

echo ""
echo "Phase 2 complete. All contracts built."
echo ""

# ─── Phase 3: Deploy ───────────────────────────────────────────────────
echo "Phase 3: Deploying to testnet..."
DEPLOYED=()
DEPLOY_FAILED=()
for old in "${DEPLOY_ORDER[@]}"; do
  new="${NAME_MAP[$old]}"
  new_dir="$CONTRACTS_DIR/$new"

  # Check if already deployed
  status=$(curl -s -o /dev/null -w "%{http_code}" "$RPC/testnet/program/${new}.aleo" 2>/dev/null)
  if [ "$status" = "200" ]; then
    echo "  [SKIP] ${new}.aleo already deployed on-chain"
    DEPLOYED+=("$new")
    continue
  fi

  echo "  [DEPLOY] ${new}.aleo (fee: $(echo "scale=1; $FEE/1000000" | bc) ALEO)..."
  cd "$new_dir"
  if leo deploy --private-key "$PRIVATE_KEY" --network testnet --endpoint "$RPC" --fee "$FEE" --non-fee-record 2>&1 | tail -5; then
    echo "  [OK] ${new}.aleo deployed!"
    DEPLOYED+=("$new")
    # Wait for confirmation
    sleep 10
  else
    echo "  [FAIL] ${new}.aleo deployment failed!"
    DEPLOY_FAILED+=("$new")
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " Deployment Summary"
echo "═══════════════════════════════════════════════════════════════"
echo " Deployed: ${DEPLOYED[*]}"
[ ${#DEPLOY_FAILED[@]} -gt 0 ] && echo " Failed:   ${DEPLOY_FAILED[*]}"
echo ""

# ─── Print .env update ─────────────────────────────────────────────────
echo "Update .env with:"
echo "VITE_PROGRAM_TOKEN=${NAME_MAP["privadex_token"]}.aleo"
echo "VITE_PROGRAM_AMM=${NAME_MAP["privadex_amm_v7"]}.aleo"
echo "VITE_PROGRAM_AMM_BTCX=${NAME_MAP["privadex_amm_btcx_v3"]}.aleo"
echo "VITE_PROGRAM_AMM_ETHX=${NAME_MAP["privadex_amm_ethx_v3"]}.aleo"
echo "VITE_PROGRAM_AMM_NATIVE_BTCX=${NAME_MAP["privadex_amm_native_btcx_v3"]}.aleo"
echo "VITE_PROGRAM_AMM_NATIVE_ETHX=${NAME_MAP["privadex_amm_native_ethx_v3"]}.aleo"
echo "VITE_PROGRAM_AMM_BTCX_ETHX=${NAME_MAP["privadex_amm_btcx_ethx_v3"]}.aleo"
echo "VITE_PROGRAM_DARKPOOL=${NAME_MAP["privadex_darkpool_v3"]}.aleo"
echo "VITE_PROGRAM_ORDERBOOK=${NAME_MAP["privadex_orderbook_v3"]}.aleo"
echo "VITE_PROGRAM_ROUTER=${NAME_MAP["privadex_router"]}.aleo"
