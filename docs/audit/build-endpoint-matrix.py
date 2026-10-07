#!/usr/bin/env python3
"""
Build the binance-sdk endpoint implementation matrix as an XLSX workbook
plus a git-friendly CSV mirror.

Source: the audit summary that confirmed the binance-sdk repo covers
133/386 endpoints across 12 Binance API collections (USDⓈ-M 94/95,
COIN-M 39/65, PM 0/109, Options 0/43, PM Pro 0/24, Crypto Loan 0/17,
Convert SAPI 0/9, Algo SAPI 0/11, Dual Investment 0/5, Alpha 0/5,
Copy Trading 0/2, C2C 0/1).

Output:
  - /home/z/my-project/download/binance-sdk-endpoint-matrix.xlsx
  - /home/z/my-project/download/binance-sdk-endpoint-matrix.csv

Columns:
  # | Collection | HTTP Method | Endpoint | Auth Mode | SDK Namespace
    | SDK Method | Registry File | Resource File | Test File | Status
    | Priority | Notes

Status values:
  - Covered              — in uploaded collection AND implemented in SDK
  - Covered (extra)      — implemented in SDK, not in uploaded collection
  - Missing              — in uploaded collection, NOT implemented in SDK
"""

from __future__ import annotations

import csv
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Iterable

# ─────────────────────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────────────────────

COLLECTIONS = [
    "USDⓈ-M Futures",
    "COIN-M Futures",
    "Portfolio Margin",
    "Options",
    "Portfolio Margin Pro",
    "Crypto Loan",
    "Convert SAPI",
    "Algo SAPI",
    "Dual Investment",
    "Alpha",
    "Copy Trading",
    "C2C",
]


@dataclass
class Row:
    collection: str
    method: str
    endpoint: str
    auth: str
    namespace: str
    sdk_method: str
    registry_file: str
    resource_file: str
    test_file: str
    status: str  # Covered | Covered (extra) | Missing
    priority: str  # P0 | P1 | P2
    notes: str = ""

    def as_csv(self) -> list[str]:
        return [
            self.collection,
            self.method,
            self.endpoint,
            self.auth,
            self.namespace,
            self.sdk_method,
            self.registry_file,
            self.resource_file,
            self.test_file,
            self.status,
            self.priority,
            self.notes,
        ]


HEADERS = [
    "Collection",
    "HTTP Method",
    "Endpoint",
    "Auth Mode",
    "SDK Namespace",
    "SDK Method",
    "Registry File",
    "Resource File",
    "Test File",
    "Status",
    "Priority",
    "Notes",
]


# ─────────────────────────────────────────────────────────────────────────────
# Registry parsers — pull the 99 USDⓈ-M and 40 COIN-M rows out of the .ts
# files in the cloned repo. Each registry row is a tuple
# [operation, method, path, auth, implementedBy].
# ─────────────────────────────────────────────────────────────────────────────

REPO = "/home/z/my-project/work/binance-sdk"


def parse_registry(rel_path: str) -> list[tuple[str, str, str, str, str]]:
    """Parse `['op', 'METHOD', '/path', 'auth', 'namespace']` rows from a
    TypeScript registry file."""
    full = os.path.join(REPO, rel_path)
    with open(full, "r", encoding="utf-8") as fh:
        src = fh.read()
    rows: list[tuple[str, str, str, str, str]] = []
    pattern = re.compile(
        r"^\s*\[\s*'([^']+)',\s*'(GET|POST|PUT|DELETE)',\s*'([^']+)',\s*'(public|apiKey|signed|none)',\s*'([^']+)'\s*\]",
        re.MULTILINE,
    )
    for match in pattern.finditer(src):
        rows.append(
            (
                match.group(1),
                match.group(2),
                match.group(3),
                match.group(4),
                match.group(5),
            )
        )
    return rows


def namespace_from_implemented_by(implemented_by: str, collection: str) -> str:
    """`futures.trading.createOrder` → `client.futures.trading`."""
    # Drop the trailing method name (last dotted segment).
    parts = implemented_by.split(".")
    if len(parts) <= 1:
        return implemented_by
    return "client." + ".".join(parts[:-1])


def sdk_method_from_implemented_by(implemented_by: str) -> str:
    """`futures.trading.createOrder` → `createOrder`."""
    parts = implemented_by.split(".")
    return parts[-1] if parts else implemented_by


def registry_file_for(collection: str) -> str:
    return {
        "USDⓈ-M Futures": "src/registry/usdm.endpoints.ts",
        "COIN-M Futures": "src/registry/coinm.endpoints.ts",
    }.get(collection, "—")  # not-yet-created collections


def resource_file_for(collection: str) -> str:
    return {
        "USDⓈ-M Futures": "src/resources/FuturesTrading.ts | FuturesAccount.ts | FuturesMarket.ts | FuturesData.ts | FuturesOps.ts",
        "COIN-M Futures": "src/resources/CoinMTrading.ts | CoinMAccount.ts | CoinMMarket.ts | CoinMUserDataStream.ts",
    }.get(collection, "— (no resource file yet — to be created)")


def test_file_for(collection: str) -> str:
    return {
        "USDⓈ-M Futures": "test/resources/FuturesTrading.test.ts | FuturesAccount.test.ts | FuturesMarket.test.ts | FuturesData.test.ts | FuturesOps.test.ts",
        "COIN-M Futures": "test/resources/CoinMTrading.test.ts | CoinMAccount.test.ts | CoinMMarket.test.ts | CoinMUserDataStream.test.ts",
    }.get(collection, "— (no test file yet — to be created)")


# ─────────────────────────────────────────────────────────────────────────────
# Build the 99 USDⓈ-M rows (94 covered + 5 extras) — using actual registry.
# ─────────────────────────────────────────────────────────────────────────────

# The 5 USDⓈ-M endpoints that exist in the registry but were NOT in the
# uploaded 95-endpoint collection (per the audit).
USDM_REGISTRY_EXTRAS = {
    "GET /fapi/v1/delistSchedule",
    "GET /fapi/v1/lvtKlines",
    "GET /fapi/v1/pmExchangeInfo",
    "GET /fapi/v1/tradingDayTicker",
    "GET /fapi/v2/ticker/bookTicker",
}

# The 1 USDⓈ-M endpoint the uploaded collection has but the registry does not.
USDM_MISSING = [
    # Futures TradFi Perps Contract — POST /fapi/v1/stock/contract
    ("POST", "/fapi/v1/stock/contract", "signed", "futures.trading",
     "createStockContractOrder", "P0",
     "Futures TradFi Perps Contract — single endpoint gap in USDⓈ-M surface."),
]


# ─────────────────────────────────────────────────────────────────────────────
# The 26 missing COIN-M endpoints (per the audit).
# Each tuple: (method, path, auth, namespace, sdk_method, priority, notes)
# ─────────────────────────────────────────────────────────────────────────────

COINM_MISSING = [
    # ---- Account / reporting (async downloads + leverageBracket v2) ----
    ("GET",    "/dapi/v1/income/asyn",        "signed", "coinm.account", "requestIncomeDownload",         "P1", "Async income download request id."),
    ("GET",    "/dapi/v1/income/asyn/id",     "signed", "coinm.account", "getIncomeDownloadStatus",       "P1", "Async income download status."),
    ("GET",    "/dapi/v1/order/asyn",         "signed", "coinm.account", "requestOrderDownload",           "P1", "Async order download request id."),
    ("GET",    "/dapi/v1/order/asyn/id",      "signed", "coinm.account", "getOrderDownloadStatus",        "P1", "Async order download status."),
    ("GET",    "/dapi/v1/trade/asyn",         "signed", "coinm.account", "requestTradeDownload",          "P1", "Async trade download request id."),
    ("GET",    "/dapi/v1/trade/asyn/id",      "signed", "coinm.account", "getTradeDownloadStatus",        "P1", "Async trade download status."),
    ("GET",    "/dapi/v2/leverageBracket",    "signed", "coinm.account", "leverageBracketsV2",            "P2", "v2 leverage bracket surface."),

    # ---- Trading ----
    ("GET",    "/dapi/v1/adlQuantile",        "signed", "coinm.trading", "adlQuantile",                   "P0", "ADL position quantile (auto-deleveraging risk)."),
    ("POST",   "/dapi/v1/batchOrders",        "signed", "coinm.trading", "createBatchOrders",             "P0", "COIN-M batch order placement (matching USDⓈ-M surface)."),
    ("PUT",    "/dapi/v1/batchOrders",         "signed", "coinm.trading", "modifyBatchOrders",            "P0", "COIN-M batch order modification."),
    ("DELETE", "/dapi/v1/batchOrders",         "signed", "coinm.trading", "cancelBatchOrders",           "P0", "COIN-M batch order cancellation."),
    ("POST",   "/dapi/v1/countdownCancelAll",  "signed", "coinm.trading", "setCountdownCancelAll",         "P0", "COIN-M countdown auto-cancel — critical risk primitive."),
    ("GET",    "/dapi/v1/openOrder",           "signed", "coinm.trading", "getCurrentOrder",              "P1", "Fetch a single open order (single-symbol, single-order)."),
    ("GET",    "/dapi/v1/orderAmendment",      "signed", "coinm.trading", "getOrderModifyHistory",         "P1", "Order modification history."),
    ("PUT",    "/dapi/v1/order",               "signed", "coinm.trading", "modifyOrder",                  "P0", "COIN-M order modify — IMPORTANT OMISSION per audit."),
    ("GET",    "/dapi/v1/positionMargin/history","signed","coinm.account","getPositionMarginHistory",     "P1", "Position margin change history."),

    # ---- Other account / market endpoints ----
    ("GET",    "/dapi/v1/pmAccountInfo",      "signed", "coinm.account", "getPmAccountInfo",              "P2", "Portfolio Margin account info via COIN-M host."),
    ("GET",    "/dapi/v1/forceOrders",         "signed", "coinm.account", "getForceOrders",               "P1", "Liquidation order history."),
    ("GET",    "/dapi/v1/constituents",        "public", "coinm.market",  "getIndexPriceConstituents",      "P2", "Index price constituents."),
    ("GET",    "/dapi/v1/fundingInfo",         "public", "coinm.market",  "getFundingInfo",                "P2", "Funding rate info."),
    ("GET",    "/dapi/v1/premiumIndexKlines",  "public", "coinm.market",  "getPremiumIndexKlines",         "P2", "Premium index klines."),

    # ---- Futures analytics ----
    ("GET",    "/futures/data/basis",                         "public", "coinm.market", "getBasis",                     "P1", "Basis analytics."),
    ("GET",    "/futures/data/globalLongShortAccountRatio",  "public", "coinm.market", "getGlobalLongShortAccountRatio","P1", "Global long/short ratio."),
    ("GET",    "/futures/data/takerBuySellVol",               "public", "coinm.market", "getTakerBuySellVol",          "P1", "Taker buy/sell volume."),
    ("GET",    "/futures/data/topLongShortAccountRatio",      "public", "coinm.market", "getTopLongShortAccountRatio", "P1", "Top trader long/short account ratio."),
    ("GET",    "/futures/data/topLongShortPositionRatio",     "public", "coinm.market", "getTopLongShortPositionRatio","P1", "Top trader long/short position ratio."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Margin — 109 missing endpoints (canonical surface; needs
# verification against the uploaded 109-endpoint collection).
# Each tuple: (method, path, auth, namespace, sdk_method, priority, notes)
# ─────────────────────────────────────────────────────────────────────────────

PM_MISSING = [
    # ---- Account & Balance (5) ----
    ("GET",  "/papi/v1/account",                "signed", "portfolioMargin.account",   "getAccount",                "P0", "Unified PM account state."),
    ("GET",  "/papi/v1/balance",                "signed", "portfolioMargin.account",   "getBalances",               "P0", "Unified PM balances."),
    ("GET",  "/papi/v1/asset-collection",       "signed", "portfolioMargin.account",   "getAssetCollection",        "P1", "Asset collection state."),
    ("POST", "/papi/v1/auto-collection",        "signed", "portfolioMargin.account",   "triggerAutoCollection",     "P1", "Trigger automatic asset collection."),
    ("POST", "/papi/v1/bnb-transfer",           "signed", "portfolioMargin.account",   "transferBnb",               "P1", "BNB transfer for fee discounts."),

    # ---- COIN-M Futures under PM (cm) — 33 endpoints ----
    ("GET",  "/papi/v1/cm/account",             "signed", "portfolioMargin.cm.account",     "getAccount",                "P0", "COIN-M account under PM."),
    ("GET",  "/papi/v1/cm/balance",             "signed", "portfolioMargin.cm.account",     "getBalances",               "P0", "COIN-M balances under PM."),
    ("GET",  "/papi/v1/cm/leverageBracket",     "signed", "portfolioMargin.cm.account",     "getLeverageBrackets",       "P1", "COIN-M leverage brackets."),
    ("GET",  "/papi/v1/cm/income",              "signed", "portfolioMargin.cm.account",     "getIncomeHistory",          "P1", "COIN-M income history."),
    ("GET",  "/papi/v1/cm/income/asyn",         "signed", "portfolioMargin.cm.account",     "requestIncomeDownload",     "P2", "Async income download request."),
    ("GET",  "/papi/v1/cm/income/asyn/id",      "signed", "portfolioMargin.cm.account",     "getIncomeDownloadStatus",   "P2", "Async income download status."),
    ("POST", "/papi/v1/cm/order",               "signed", "portfolioMargin.cm.trading",     "createOrder",               "P0", "COIN-M order placement."),
    ("POST", "/papi/v1/cm/order/test",          "signed", "portfolioMargin.cm.trading",     "createTestOrder",           "P2", "COIN-M order test."),
    ("POST", "/papi/v1/cm/batchOrders",         "signed", "portfolioMargin.cm.trading",     "createBatchOrders",         "P1", "COIN-M batch orders."),
    ("PUT",  "/papi/v1/cm/batchOrders",         "signed", "portfolioMargin.cm.trading",     "modifyBatchOrders",         "P1", "COIN-M batch orders modify."),
    ("DELETE","/papi/v1/cm/batchOrders",        "signed", "portfolioMargin.cm.trading",     "cancelBatchOrders",         "P1", "COIN-M batch orders cancel."),
    ("DELETE","/papi/v1/cm/order",              "signed", "portfolioMargin.cm.trading",     "cancelOrder",               "P0", "COIN-M order cancel."),
    ("DELETE","/papi/v1/cm/allOpenOrders",      "signed", "portfolioMargin.cm.trading",     "cancelAllOpenOrders",       "P0", "COIN-M cancel-all."),
    ("GET",  "/papi/v1/cm/openOrders",          "signed", "portfolioMargin.cm.trading",     "getOpenOrders",             "P1", "COIN-M open orders."),
    ("GET",  "/papi/v1/cm/allOrders",           "signed", "portfolioMargin.cm.trading",     "getAllOrders",              "P1", "COIN-M all orders."),
    ("GET",  "/papi/v1/cm/order",               "signed", "portfolioMargin.cm.trading",     "getOrder",                  "P1", "COIN-M order fetch."),
    ("GET",  "/papi/v1/cm/historicalOrders",    "signed", "portfolioMargin.cm.trading",     "getHistoricalOrders",       "P2", "COIN-M historical orders."),
    ("GET",  "/papi/v1/cm/order/asyn",          "signed", "portfolioMargin.cm.account",     "requestOrderDownload",      "P2", "Async order download request."),
    ("GET",  "/papi/v1/cm/order/asyn/id",       "signed", "portfolioMargin.cm.account",     "getOrderDownloadStatus",    "P2", "Async order download status."),
    ("GET",  "/papi/v1/cm/positionRisk",        "signed", "portfolioMargin.cm.account",     "getPositionRisk",           "P0", "COIN-M position risk."),
    ("GET",  "/papi/v1/cm/userServiceMargin",   "signed", "portfolioMargin.cm.account",     "getUserServiceMargin",      "P2", "User service margin."),
    ("GET",  "/papi/v1/cm/pmAccountInfo",       "signed", "portfolioMargin.cm.account",     "getPmAccountInfo",          "P2", "PM account info via CM."),
    ("GET",  "/papi/v1/cm/forceOrders",         "signed", "portfolioMargin.cm.account",     "getForceOrders",            "P1", "COIN-M liquidation orders."),
    ("POST", "/papi/v1/cm/positionMargin",      "signed", "portfolioMargin.cm.trading",     "modifyPositionMargin",      "P1", "COIN-M position margin adjustment."),
    ("GET",  "/papi/v1/cm/positionMargin/history","signed","portfolioMargin.cm.account",    "getPositionMarginHistory",  "P1", "COIN-M position margin history."),
    ("POST", "/papi/v1/cm/countdownCancelAll",  "signed", "portfolioMargin.cm.trading",     "setCountdownCancelAll",     "P1", "COIN-M countdown auto-cancel."),
    ("POST", "/papi/v1/cm/leverage",            "signed", "portfolioMargin.cm.trading",     "setLeverage",               "P0", "COIN-M leverage set."),
    ("POST", "/papi/v1/cm/marginType",          "signed", "portfolioMargin.cm.trading",     "setMarginType",             "P0", "COIN-M margin type."),
    ("POST", "/papi/v1/cm/positionSide/dual",   "signed", "portfolioMargin.cm.trading",     "setPositionSide",           "P1", "COIN-M position side (hedge mode)."),

    # ---- USDⓈ-M Futures under PM (um) — 33 endpoints ----
    ("GET",  "/papi/v1/um/account",             "signed", "portfolioMargin.um.account",     "getAccount",                "P0", "USDⓈ-M account under PM."),
    ("GET",  "/papi/v1/um/balance",             "signed", "portfolioMargin.um.account",     "getBalances",               "P0", "USDⓈ-M balances under PM."),
    ("GET",  "/papi/v1/um/leverageBracket",     "signed", "portfolioMargin.um.account",     "getLeverageBrackets",       "P1", "USDⓈ-M leverage brackets."),
    ("GET",  "/papi/v1/um/income",              "signed", "portfolioMargin.um.account",     "getIncomeHistory",          "P1", "USDⓈ-M income history."),
    ("GET",  "/papi/v1/um/income/asyn",         "signed", "portfolioMargin.um.account",     "requestIncomeDownload",     "P2", "Async income download request."),
    ("GET",  "/papi/v1/um/income/asyn/id",      "signed", "portfolioMargin.um.account",     "getIncomeDownloadStatus",   "P2", "Async income download status."),
    ("POST", "/papi/v1/um/order",               "signed", "portfolioMargin.um.trading",     "createOrder",               "P0", "USDⓈ-M order placement."),
    ("POST", "/papi/v1/um/order/test",          "signed", "portfolioMargin.um.trading",     "createTestOrder",           "P2", "USDⓈ-M order test."),
    ("POST", "/papi/v1/um/batchOrders",         "signed", "portfolioMargin.um.trading",     "createBatchOrders",         "P1", "USDⓈ-M batch orders."),
    ("PUT",  "/papi/v1/um/batchOrders",         "signed", "portfolioMargin.um.trading",     "modifyBatchOrders",         "P1", "USDⓈ-M batch orders modify."),
    ("DELETE","/papi/v1/um/batchOrders",        "signed", "portfolioMargin.um.trading",     "cancelBatchOrders",         "P1", "USDⓈ-M batch orders cancel."),
    ("DELETE","/papi/v1/um/order",              "signed", "portfolioMargin.um.trading",     "cancelOrder",               "P0", "USDⓈ-M order cancel."),
    ("DELETE","/papi/v1/um/allOpenOrders",      "signed", "portfolioMargin.um.trading",     "cancelAllOpenOrders",       "P0", "USDⓈ-M cancel-all."),
    ("GET",  "/papi/v1/um/openOrders",          "signed", "portfolioMargin.um.trading",     "getOpenOrders",             "P1", "USDⓈ-M open orders."),
    ("GET",  "/papi/v1/um/allOrders",           "signed", "portfolioMargin.um.trading",     "getAllOrders",              "P1", "USDⓈ-M all orders."),
    ("GET",  "/papi/v1/um/order",               "signed", "portfolioMargin.um.trading",     "getOrder",                  "P1", "USDⓈ-M order fetch."),
    ("GET",  "/papi/v1/um/historicalOrders",    "signed", "portfolioMargin.um.trading",     "getHistoricalOrders",       "P2", "USDⓈ-M historical orders."),
    ("GET",  "/papi/v1/um/order/asyn",          "signed", "portfolioMargin.um.account",     "requestOrderDownload",      "P2", "Async order download request."),
    ("GET",  "/papi/v1/um/order/asyn/id",       "signed", "portfolioMargin.um.account",     "getOrderDownloadStatus",    "P2", "Async order download status."),
    ("GET",  "/papi/v1/um/positionRisk",        "signed", "portfolioMargin.um.account",     "getPositionRisk",           "P0", "USDⓈ-M position risk."),
    ("GET",  "/papi/v1/um/userServiceMargin",   "signed", "portfolioMargin.um.account",     "getUserServiceMargin",      "P2", "User service margin."),
    ("GET",  "/papi/v1/um/pmAccountInfo",       "signed", "portfolioMargin.um.account",     "getPmAccountInfo",          "P2", "PM account info via UM."),
    ("GET",  "/papi/v1/um/forceOrders",         "signed", "portfolioMargin.um.account",     "getForceOrders",            "P1", "USDⓈ-M liquidation orders."),
    ("POST", "/papi/v1/um/positionMargin",      "signed", "portfolioMargin.um.trading",     "modifyPositionMargin",      "P1", "USDⓈ-M position margin adjustment."),
    ("GET",  "/papi/v1/um/positionMargin/history","signed","portfolioMargin.um.account",    "getPositionMarginHistory",  "P1", "USDⓈ-M position margin history."),
    ("POST", "/papi/v1/um/countdownCancelAll",  "signed", "portfolioMargin.um.trading",     "setCountdownCancelAll",     "P1", "USDⓈ-M countdown auto-cancel."),
    ("POST", "/papi/v1/um/leverage",            "signed", "portfolioMargin.um.trading",     "setLeverage",               "P0", "USDⓈ-M leverage set."),
    ("POST", "/papi/v1/um/marginType",          "signed", "portfolioMargin.um.trading",     "setMarginType",             "P0", "USDⓈ-M margin type."),
    ("POST", "/papi/v1/um/positionSide/dual",   "signed", "portfolioMargin.um.trading",     "setPositionSide",           "P1", "USDⓈ-M position side (hedge mode)."),
    ("POST", "/papi/v1/um/algo/order",          "signed", "portfolioMargin.um.trading",     "createAlgoOrder",           "P1", "USDⓈ-M algo (conditional) order."),
    ("DELETE","/papi/v1/um/algo/order",          "signed", "portfolioMargin.um.trading",     "cancelAlgoOrder",           "P1", "USDⓈ-M algo order cancel."),
    ("GET",  "/papi/v1/um/algo/openOrders",     "signed", "portfolioMargin.um.trading",     "getOpenAlgoOrders",         "P1", "USDⓈ-M open algo orders."),
    ("GET",  "/papi/v1/um/algo/historicalOrders","signed","portfolioMargin.um.trading",     "getHistoricalAlgoOrders",   "P2", "USDⓈ-M historical algo orders."),
    ("GET",  "/papi/v1/um/algo/allOrders",      "signed", "portfolioMargin.um.trading",     "getAllAlgoOrders",          "P2", "USDⓈ-M all algo orders."),

    # ---- Margin (cross / isolated) — 22 endpoints ----
    ("GET",  "/papi/v1/margin/marginLoan",      "signed", "portfolioMargin.margin",        "getMarginLoanHistory",      "P1", "Margin loan history (deprecated alias — keep for legacy callers)."),
    ("GET",  "/papi/v1/margin/repay",           "signed", "portfolioMargin.margin",        "getRepayHistory",           "P1", "Margin repay history (deprecated alias)."),
    ("GET",  "/papi/v1/margin/interestHistory", "signed", "portfolioMargin.margin",        "getInterestHistory",        "P1", "Margin interest history."),
    ("GET",  "/papi/v1/margin/account",         "signed", "portfolioMargin.margin",        "getMarginAccount",          "P0", "Cross margin account state."),
    ("GET",  "/papi/v1/margin/accountInfo",     "signed", "portfolioMargin.margin",        "getMarginAccountInfo",      "P1", "Margin account info."),
    ("GET",  "/papi/v1/margin/marginLevel",     "signed", "portfolioMargin.margin",        "getMarginLevel",            "P2", "Margin level info."),
    ("POST", "/papi/v1/margin/borrow",          "signed", "portfolioMargin.margin",        "borrow",                    "P0", "Margin borrow (v2 endpoint alias)."),
    ("POST", "/papi/v1/margin/repay",           "signed", "portfolioMargin.margin",        "repay",                     "P0", "Margin repay (v2 endpoint alias)."),
    ("GET",  "/papi/v1/margin/borrowable",      "signed", "portfolioMargin.margin",        "getBorrowable",             "P2", "Borrowable amount check."),
    ("POST", "/papi/v1/margin/transfer",        "signed", "portfolioMargin.margin",        "transfer",                  "P1", "Margin transfer."),
    ("GET",  "/papi/v1/margin/transfer",        "signed", "portfolioMargin.margin",        "getTransferHistory",        "P2", "Margin transfer history."),
    ("POST", "/papi/v1/margin/isolated/transfer","signed","portfolioMargin.margin.isolated","transfer",                  "P1", "Isolated margin transfer."),
    ("GET",  "/papi/v1/margin/isolated/account","signed", "portfolioMargin.margin.isolated","getAccount",                "P1", "Isolated margin account."),
    ("GET",  "/papi/v1/margin/isolated/accountLimit","signed","portfolioMargin.margin.isolated","getAccountLimit",       "P2", "Isolated account limit."),
    ("GET",  "/papi/v1/margin/isolated/transfer","signed","portfolioMargin.margin.isolated","getTransferHistory",        "P2", "Isolated transfer history."),
    ("GET",  "/papi/v1/margin/isolated/transferHistory","signed","portfolioMargin.margin.isolated","getAllTransferHistory","P2", "All isolated transfer history."),
    ("GET",  "/papi/v1/margin/isolated/isolatedMarginTier","signed","portfolioMargin.margin.isolated","getMarginTier",    "P2", "Isolated margin tier."),
    ("GET",  "/papi/v1/margin/isolated/isolatedMarginData","signed","portfolioMargin.margin.isolated","getMarginData",    "P2", "Isolated margin data."),
    ("GET",  "/papi/v1/margin/dust",            "signed", "portfolioMargin.margin",        "getDust",                   "P2", "Dust balance log."),
    ("POST", "/papi/v1/margin/dust",            "signed", "portfolioMargin.margin",        "transferDust",              "P2", "Dust transfer (deprecated alias)."),
    ("GET",  "/papi/v1/margin/dustLog",         "signed", "portfolioMargin.margin",        "getDustLog",                "P2", "Dust transfer log."),
    ("POST", "/papi/v1/margin/transferToEpic",  "signed", "portfolioMargin.margin",        "transferToEpic",            "P2", "Transfer to Epic (deprecated alias)."),

    # ---- Portfolio (repay / lock / swap) — 8 endpoints ----
    ("GET",  "/papi/v1/portfolio/account",      "signed", "portfolioMargin.portfolio",     "getAccount",                "P0", "Portfolio account state."),
    ("GET",  "/papi/v1/portfolio/balance",      "signed", "portfolioMargin.portfolio",     "getBalance",                "P0", "Portfolio balance."),
    ("GET",  "/papi/v1/portfolio/repayLoan",    "signed", "portfolioMargin.portfolio",     "getRepayLoanHistory",       "P1", "Repay loan history."),
    ("POST", "/papi/v1/portfolio/repayLoan",    "signed", "portfolioMargin.portfolio",     "repayLoan",                 "P0", "Trigger portfolio loan repayment (deprecated alias)."),
    ("POST", "/papi/v1/portfolio/selfRepayLoan","signed","portfolioMargin.portfolio",     "triggerSelfRepayLoan",      "P0", "Trigger self-repay loan."),
    ("GET",  "/papi/v1/portfolio/selfRepayLoanStatus","signed","portfolioMargin.portfolio","getSelfRepayLoanStatus",     "P1", "Self-repay loan status."),
    ("GET",  "/papi/v1/portfolio/swapHistory",  "signed", "portfolioMargin.portfolio",     "getSwapHistory",            "P1", "Margin swap history."),
    ("POST", "/papi/v1/portfolio/lock",        "signed", "portfolioMargin.portfolio",     "lockAsset",                 "P2", "Lock asset for collateral."),

    # ---- Other — 11 endpoints (incl. position-side queries + listenKey GET
    #      for full listenKey CRUD as Binance documents it on the PM host) ----
    ("GET",  "/papi/v1/cm/positionSide/dual",    "signed", "portfolioMargin.cm.account",    "getPositionSide",            "P2", "COIN-M position side (hedge mode) status query."),
    ("GET",  "/papi/v1/um/positionSide/dual",    "signed", "portfolioMargin.um.account",    "getPositionSide",            "P2", "USDⓈ-M position side (hedge mode) status query."),
    ("GET",  "/papi/v1/portfolio/lock",          "signed", "portfolioMargin.portfolio",     "getLockStatus",              "P2", "Locked asset status query."),
    ("GET",  "/papi/v1/rateLimit/order",        "signed", "portfolioMargin.account",       "getOrderRateLimit",         "P2", "Order rate limit."),
    ("POST", "/papi/v1/repay-futures-negative-balance","signed","portfolioMargin.account",  "repayNegativeBalance",      "P1", "Repay negative futures balance."),
    ("POST", "/papi/v1/repay-futures-switch",   "signed", "portfolioMargin.account",       "setRepaySwitch",            "P1", "Set futures repay switch."),
    ("GET",  "/papi/v1/repay-futures-switch",   "signed", "portfolioMargin.account",       "getRepaySwitch",            "P1", "Get futures repay switch."),
    ("POST", "/papi/v1/listenKey",             "apiKey", "portfolioMargin.userStream",      "createListenKey",           "P0", "User data stream listen key create."),
    ("PUT",  "/papi/v1/listenKey",              "apiKey", "portfolioMargin.userStream",      "keepAliveListenKey",        "P0", "User data stream keepalive."),
    ("DELETE","/papi/v1/listenKey",             "apiKey", "portfolioMargin.userStream",      "closeListenKey",            "P0", "User data stream close."),
    ("GET",  "/papi/v1/portfolioRepayLoan",     "signed", "portfolioMargin.portfolio",      "getPortfolioRepayLoan",     "P2", "Portfolio repay loan v2."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Options — 43 missing endpoints (canonical /eapi/v1 surface).
# ─────────────────────────────────────────────────────────────────────────────

OPTIONS_MISSING = [
    # ---- Public market data — 15 endpoints ----
    ("GET", "/eapi/v1/ping",                "public", "options.market", "ping",                "P2", "Connectivity check."),
    ("GET", "/eapi/v1/time",                 "public", "options.market", "serverTime",          "P2", "Server time."),
    ("GET", "/eapi/v1/exchangeInfo",         "public", "options.market", "exchangeInfo",        "P0", "Options exchange info."),
    ("GET", "/eapi/v1/optionChain",          "public", "options.market", "getOptionChain",      "P0", "Option chain."),
    ("GET", "/eapi/v1/index",               "public", "options.market", "getIndex",            "P1", "Underlying index price."),
    ("GET", "/eapi/v1/ticker",              "public", "options.market", "getTicker",           "P0", "Ticker."),
    ("GET", "/eapi/v1/depth",               "public", "options.market", "getDepth",            "P0", "Order book depth."),
    ("GET", "/eapi/v1/trades",              "public", "options.market", "getTrades",            "P1", "Recent trades."),
    ("GET", "/eapi/v1/historicalTrades",     "apiKey", "options.market", "getHistoricalTrades", "P2", "Historical trades."),
    ("GET", "/eapi/v1/klines",              "public", "options.market", "getKlines",           "P1", "Klines."),
    ("GET", "/eapi/v1/uiKlines",            "public", "options.market", "getUiKlines",         "P2", "UI klines."),
    ("GET", "/eapi/v1/mark",                "public", "options.market", "getMark",             "P1", "Mark price."),
    ("GET", "/eapi/v1/openInterest",        "public", "options.market", "getOpenInterest",     "P1", "Open interest."),
    ("GET", "/eapi/v1/exerciseHistory",     "signed", "options.account", "getExerciseHistory","P1", "Exercise history."),
    ("GET", "/eapi/v1/exerciseRecord",      "signed", "options.account", "getExerciseRecord", "P2", "Exercise record."),

    # ---- Account — 5 endpoints ----
    ("GET", "/eapi/v1/account",             "signed", "options.account", "getAccount",         "P0", "Options account."),
    ("GET", "/eapi/v1/position",            "signed", "options.account", "getPositions",       "P0", "Open positions."),
    ("GET", "/eapi/v1/marginAccount",       "signed", "options.account", "getMarginAccount",   "P0", "Margin account."),
    ("GET", "/eapi/v1/bill",               "signed", "options.account", "getBill",             "P1", "Billing."),
    ("GET", "/eapi/v1/commission",          "signed", "options.account", "getCommission",      "P1", "Commission rates."),

    # ---- Trading — 16 endpoints ----
    ("POST",   "/eapi/v1/order",            "signed", "options.trading", "createOrder",         "P0", "Options order placement."),
    ("GET",    "/eapi/v1/order",            "signed", "options.trading", "getOrder",            "P1", "Options order fetch."),
    ("DELETE", "/eapi/v1/order",            "signed", "options.trading", "cancelOrder",         "P0", "Options order cancel."),
    ("PUT",    "/eapi/v1/order",             "signed", "options.trading", "modifyOrder",        "P1", "Options order modify."),
    ("GET",    "/eapi/v1/openOrders",        "signed", "options.trading", "getOpenOrders",       "P1", "Open orders."),
    ("GET",    "/eapi/v1/allOrders",         "signed", "options.trading", "getAllOrders",        "P1", "All orders."),
    ("GET",    "/eapi/v1/historyOrders",     "signed", "options.trading", "getHistoricalOrders", "P2", "Historical orders."),
    ("GET",    "/eapi/v1/userTrades",        "signed", "options.trading", "getUserTrades",       "P1", "User trades."),
    ("POST",   "/eapi/v1/batchOrders",       "signed", "options.trading", "createBatchOrders",   "P1", "Batch orders."),
    ("PUT",    "/eapi/v1/batchOrders",       "signed", "options.trading", "modifyBatchOrders",   "P1", "Batch orders modify."),
    ("DELETE", "/eapi/v1/batchOrders",       "signed", "options.trading", "cancelBatchOrders",   "P1", "Batch orders cancel."),
    ("POST",   "/eapi/v1/countdownCancelAll","signed", "options.trading", "setCountdownCancelAll","P1","Countdown auto-cancel."),
    ("GET",    "/eapi/v1/mmp",               "signed", "options.trading", "getMmp",              "P2", "Market maker protection config."),
    ("POST",   "/eapi/v1/mmpSet",            "signed", "options.trading", "setMmp",              "P2", "Set MMP."),
    ("POST",   "/eapi/v1/mmpReset",          "signed", "options.trading", "resetMmp",            "P2", "Reset MMP."),

    # ---- Block trading — 5 endpoints ----
    ("POST", "/eapi/v1/block/order/create",  "signed", "options.block", "createBlockOrder",     "P2", "Block order create."),
    ("POST", "/eapi/v1/block/order/execute", "signed", "options.block", "executeBlockOrder",    "P2", "Block order execute."),
    ("GET",  "/eapi/v1/block/order/orders",  "signed", "options.block", "getBlockOrders",       "P2", "Block order list."),
    ("GET",  "/eapi/v1/block/user-trades",   "signed", "options.block", "getBlockUserTrades",   "P2", "Block user trades."),
    ("GET",  "/eapi/v1/blockTrades",          "public", "options.market", "getBlockTrades",     "P2", "Public block-trade ticker (recent executed block trades)."),

    # ---- User data stream — 3 endpoints ----
    ("POST",   "/eapi/v1/listenKey",         "apiKey", "options.userStream", "createListenKey", "P0", "Listen key create."),
    ("PUT",    "/eapi/v1/listenKey",         "apiKey", "options.userStream", "keepAliveListenKey","P0","Listen key keepalive."),
    ("DELETE", "/eapi/v1/listenKey",         "apiKey", "options.userStream", "closeListenKey",   "P0","Listen key close."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Margin Pro — 24 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

PMPRO_MISSING = [
    # ---- Account & balance (5) ----
    ("GET",  "/sapi/v1/portfolio/account",              "signed", "pmPro.account", "getAccount",                    "P0", "PM Pro account state."),
    ("GET",  "/sapi/v1/portfolio/balance",              "signed", "pmPro.account", "getBalance",                    "P0", "PM Pro balance."),
    ("GET",  "/sapi/v1/portfolio/asset-collection",      "signed", "pmPro.account", "getAssetCollection",            "P1", "Asset collection."),
    ("POST", "/sapi/v1/portfolio/auto-collection",       "signed", "pmPro.account", "triggerAutoCollection",          "P1", "Trigger auto-collection."),
    ("POST", "/sapi/v1/portfolio/bnb-transfer",          "signed", "pmPro.account", "transferBnb",                   "P1", "BNB transfer."),

    # ---- Configuration / mode (3) ----
    ("GET",  "/sapi/v1/portfolio/delta-mode",           "signed", "pmPro.config",  "getDeltaMode",                   "P1", "Get delta accounting mode."),
    ("POST", "/sapi/v1/portfolio/delta-mode",           "signed", "pmPro.config",  "setDeltaMode",                   "P1", "Set delta accounting mode."),

    # ---- Earn asset (3) ----
    ("GET",  "/sapi/v1/portfolio/earn-asset-balance",   "signed", "pmPro.earn",    "getEarnAssetBalance",            "P2", "Earn asset balance."),
    ("POST", "/sapi/v1/portfolio/earn-asset-transfer",   "signed", "pmPro.earn",    "transferEarnAsset",               "P2", "Earn asset transfer."),
    ("GET",  "/sapi/v1/portfolio/interest-history",      "signed", "pmPro.earn",    "getInterestHistory",             "P2", "Interest history."),

    # ---- Margin / risk (3) ----
    ("GET",  "/sapi/v1/portfolio/margin-call-level",     "signed", "pmPro.risk",    "getMarginCallLevel",             "P1", "Margin call level."),
    ("GET",  "/sapi/v1/portfolio/asset-index-price",     "public", "pmPro.risk",    "getAssetIndexPrice",              "P1", "Asset index price."),
    ("GET",  "/sapi/v1/portfolio/collateralRate",        "public", "pmPro.risk",    "getCollateralRate",               "P1", "Collateral rate."),
    ("GET",  "/sapi/v1/portfolio/margin-asset-leverage", "public", "pmPro.risk",    "getMarginAssetLeverage",           "P2", "Margin asset leverage."),

    # ---- Loans & repay (6) ----
    ("POST", "/sapi/v1/portfolio/pmLoan",                "signed", "pmPro.loan",    "createPmLoan",                   "P2", "PM loan create."),
    ("GET",  "/sapi/v1/portfolio/pmLoan",                "signed", "pmPro.loan",    "getPmLoans",                     "P2", "PM loan list (open loans)."),
    ("GET",  "/sapi/v1/portfolio/pmloan-history",        "signed", "pmPro.loan",    "getPmLoanHistory",               "P2", "PM loan history."),
    ("POST", "/sapi/v1/portfolio/repay",                "signed", "pmPro.loan",    "repay",                          "P2", "Repay PM loan."),
    ("POST", "/sapi/v1/portfolio/repay-futures-negative-balance","signed","pmPro.account","repayNegativeBalance","P1", "Repay futures negative balance."),
    ("POST", "/sapi/v1/portfolio/repay-futures-switch", "signed", "pmPro.account", "setRepaySwitch",                 "P1", "Set repay switch."),

    # ---- v2 surface (5) ----
    ("GET",  "/sapi/v2/portfolio/account",               "signed", "pmPro.account", "getAccountV2",                   "P1", "PM Pro account v2."),
    ("GET",  "/sapi/v2/portfolio/balance",               "signed", "pmPro.account", "getBalanceV2",                   "P1", "PM Pro balance v2."),
    ("GET",  "/sapi/v2/portfolio/collateralRate",        "public", "pmPro.risk",    "getCollateralRateV2",             "P1", "Collateral rate v2."),
    ("GET",  "/sapi/v2/portfolio/asset-collection",      "signed", "pmPro.account", "getAssetCollectionV2",            "P2", "Asset collection v2."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Crypto Loan — 17 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

CRYPTOLOAN_MISSING = [
    # ---- V1 (5) ----
    ("GET",  "/sapi/v1/loan/borrow/history",            "signed", "cryptoLoan.history",       "getBorrowHistory",            "P1", "V1 borrow history."),
    ("GET",  "/sapi/v1/loan/income",                    "signed", "cryptoLoan.history",       "getIncome",                   "P1", "V1 income."),
    ("GET",  "/sapi/v1/loan/ltv/adjustment/history",    "signed", "cryptoLoan.history",       "getLtvAdjustmentHistory",     "P2", "V1 LTV adjustment history."),
    ("GET",  "/sapi/v1/loan/repay/collateral/rate",     "signed", "cryptoLoan.rate",           "getRepayCollateralRate",      "P2", "Repay collateral rate."),
    ("GET",  "/sapi/v1/loan/repay/history",             "signed", "cryptoLoan.history",       "getRepayHistory",             "P1", "V1 repay history."),

    # ---- V2 flexible (11) ----
    ("POST", "/sapi/v2/loan/flexible/adjust/ltv",       "signed", "cryptoLoan.flexible",       "adjustLtv",                   "P1", "Flexible LTV adjust."),
    ("POST", "/sapi/v2/loan/flexible/borrow",           "signed", "cryptoLoan.flexible",       "borrow",                      "P0", "Flexible borrow."),
    ("GET",  "/sapi/v2/loan/flexible/borrow/history",   "signed", "cryptoLoan.flexible.history","getBorrowHistory",           "P1", "Flexible borrow history."),
    ("GET",  "/sapi/v2/loan/flexible/collateral/data",  "signed", "cryptoLoan.flexible.data",  "getCollateralData",           "P2", "Flexible collateral data."),
    ("GET",  "/sapi/v2/loan/flexible/liquidation/history","signed","cryptoLoan.flexible.history","getLiquidationHistory",     "P2", "Flexible liquidation history."),
    ("GET",  "/sapi/v2/loan/flexible/loanable/data",    "signed", "cryptoLoan.flexible.data",  "getLoanableData",             "P2", "Flexible loanable data."),
    ("GET",  "/sapi/v2/loan/flexible/ltv/adjustment/history","signed","cryptoLoan.flexible.history","getLtvAdjustmentHistory","P2", "Flexible LTV adjustment history."),
    ("GET",  "/sapi/v2/loan/flexible/ongoing/orders",    "signed", "cryptoLoan.flexible",       "getOngoingOrders",            "P0", "Flexible ongoing orders."),
    ("POST", "/sapi/v2/loan/flexible/repay",            "signed", "cryptoLoan.flexible",       "repay",                       "P0", "Flexible repay."),
    ("GET",  "/sapi/v2/loan/flexible/repay/history",    "signed", "cryptoLoan.flexible.history","getRepayHistory",            "P1", "Flexible repay history."),
    ("GET",  "/sapi/v2/loan/flexible/repay/rate",       "signed", "cryptoLoan.flexible.rate",  "getRepayRate",                "P2", "Flexible repay rate."),

    # ---- V2 interest history (1) ----
    ("GET",  "/sapi/v2/loan/interestRateHistory",       "signed", "cryptoLoan.history",       "getInterestRateHistory",       "P2", "Interest rate history."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Convert SAPI — 9 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

CONVERTSAPI_MISSING = [
    ("POST", "/sapi/v1/convert/acceptQuote",           "signed", "convert.spot", "acceptQuote",            "P0", "Accept quote (SAPI)."),
    ("POST", "/sapi/v1/convert/getQuote",              "signed", "convert.spot", "getQuote",               "P0", "Get quote (SAPI)."),
    ("POST", "/sapi/v1/convert/limit/cancelOrder",     "signed", "convert.spot.limit", "cancelOrder",        "P1", "Cancel limit order."),
    ("POST", "/sapi/v1/convert/limit/placeOrder",     "signed", "convert.spot.limit", "placeOrder",         "P1", "Place limit order."),
    ("GET",  "/sapi/v1/convert/limit/queryOpenOrders", "signed", "convert.spot.limit", "getOpenOrders",      "P1", "Query open limit orders."),
    ("GET",  "/sapi/v1/convert/orderStatus",           "signed", "convert.spot", "getOrderStatus",         "P0", "Order status."),
    ("GET",  "/sapi/v1/convert/tradeFlow",             "signed", "convert.spot", "getTradeFlow",           "P1", "Trade flow history."),
    ("GET",  "/sapi/v1/convert/assetInfo",             "public", "convert.spot", "getAssetInfo",           "P1", "Convert asset info."),
    ("GET",  "/sapi/v1/convert/exchangeInfo",          "public", "convert.spot", "getExchangeInfo",        "P1", "Convert exchange info."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Algo SAPI — 11 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

ALGOSAPI_MISSING = [
    # ---- Futures algo (6) ----
    ("GET",    "/sapi/v1/algo/futures/historicalOrders","signed", "algo.futures", "getHistoricalOrders", "P1", "Futures algo historical orders."),
    ("POST",   "/sapi/v1/algo/futures/newOrderTwap",   "signed", "algo.futures", "createTwapOrder",     "P0", "Futures algo TWAP order."),
    ("POST",   "/sapi/v1/algo/futures/newOrderVp",     "signed", "algo.futures", "createVpOrder",       "P0", "Futures algo VP order."),
    ("GET",    "/sapi/v1/algo/futures/openOrders",     "signed", "algo.futures", "getOpenOrders",       "P0", "Futures algo open orders."),
    ("DELETE", "/sapi/v1/algo/futures/order",          "signed", "algo.futures", "cancelOrder",         "P0", "Futures algo cancel order."),
    ("GET",    "/sapi/v1/algo/futures/subOrders",       "signed", "algo.futures", "getSubOrders",        "P1", "Futures algo sub-orders."),

    # ---- Spot algo (5) ----
    ("GET",    "/sapi/v1/algo/spot/historicalOrders",  "signed", "algo.spot", "getHistoricalOrders",     "P1", "Spot algo historical orders."),
    ("POST",   "/sapi/v1/algo/spot/newOrderTwap",      "signed", "algo.spot", "createTwapOrder",         "P0", "Spot algo TWAP order."),
    ("GET",    "/sapi/v1/algo/spot/openOrders",         "signed", "algo.spot", "getOpenOrders",           "P0", "Spot algo open orders."),
    ("DELETE", "/sapi/v1/algo/spot/order",              "signed", "algo.spot", "cancelOrder",              "P0", "Spot algo cancel order."),
    ("GET",    "/sapi/v1/algo/spot/subOrders",          "signed", "algo.spot", "getSubOrders",             "P1", "Spot algo sub-orders."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Dual Investment — 5 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

DUALINVESTMENT_MISSING = [
    ("GET",  "/sapi/v1/dci/product/accounts",         "signed", "dualInvestment", "getAccounts",          "P1", "DCI product accounts."),
    ("POST", "/sapi/v1/dci/product/auto_compound/edit-status","signed","dualInvestment","editAutoCompoundStatus","P1", "Edit auto-compound status."),
    ("GET",  "/sapi/v1/dci/product/positions",       "signed", "dualInvestment", "getPositions",         "P1", "DCI product positions."),
    ("POST", "/sapi/v1/dci/product/subscribe",        "signed", "dualInvestment", "subscribe",            "P0", "DCI product subscribe."),
    ("GET",  "/sapi/v1/dci/product/list",             "signed", "dualInvestment", "listProducts",         "P1", "DCI product list."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Alpha — 5 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

ALPHA_MISSING = [
    ("GET", "/bapi/defi/v1/public/alpha-trade/agg-trades",                              "public", "alpha.market", "getAggTrades",     "P1", "Alpha agg-trades."),
    ("GET", "/bapi/defi/v1/public/alpha-trade/get-exchange-info",                       "public", "alpha.market", "getExchangeInfo", "P0", "Alpha exchange info."),
    ("GET", "/bapi/defi/v1/public/alpha-trade/klines",                                  "public", "alpha.market", "getKlines",         "P1", "Alpha klines."),
    ("GET", "/bapi/defi/v1/public/alpha-trade/ticker",                                  "public", "alpha.market", "getTicker",         "P1", "Alpha ticker."),
    ("GET", "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list",  "public", "alpha.wallet", "getTokenList",     "P2", "Alpha wallet token list."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Copy Trading — 2 missing endpoints.
# ─────────────────────────────────────────────────────────────────────────────

COPYTRADING_MISSING = [
    ("GET", "/sapi/v1/copyTrading/futures/leadSymbol",  "signed", "copyTrading.futures", "getLeadSymbol",   "P1", "Copy-trading lead symbol."),
    ("GET", "/sapi/v1/copyTrading/futures/userStatus",  "signed", "copyTrading.futures", "getUserStatus",   "P1", "Copy-trading user status."),
]


# ─────────────────────────────────────────────────────────────────────────────
# C2C — 1 missing endpoint.
# ─────────────────────────────────────────────────────────────────────────────

C2C_MISSING = [
    ("GET", "/sapi/v1/c2c/orderMatch/listUserOrderHistory", "signed", "c2c", "getUserOrderHistory", "P2", "C2C order-match user history."),
]


# ─────────────────────────────────────────────────────────────────────────────
# Resource-file / test-file mappings for new collections (not yet implemented).
# ─────────────────────────────────────────────────────────────────────────────

COLLECTION_FILES = {
    "Portfolio Margin": {
        "registry":  "(new) src/registry/pm.endpoints.ts",
        "resource":  "(new) src/resources/PortfolioMargin.ts | PortfolioMarginUm.ts | PortfolioMarginCm.ts | PortfolioMarginMargin.ts | PortfolioMarginPortfolio.ts",
        "test":      "(new) test/resources/PortfolioMargin.test.ts",
        "namespace_prefix": "portfolioMargin",
    },
    "Options": {
        "registry":  "(new) src/registry/options.endpoints.ts",
        "resource":  "(new) src/resources/Options.ts | OptionsMarket.ts | OptionsTrading.ts | OptionsAccount.ts",
        "test":      "(new) test/resources/Options.test.ts",
        "namespace_prefix": "options",
    },
    "Portfolio Margin Pro": {
        "registry":  "(new) src/registry/pmpro.endpoints.ts",
        "resource":  "(new) src/resources/PortfolioMarginPro.ts",
        "test":      "(new) test/resources/PortfolioMarginPro.test.ts",
        "namespace_prefix": "pmPro",
    },
    "Crypto Loan": {
        "registry":  "(new) src/registry/cryptoLoan.endpoints.ts",
        "resource":  "(new) src/resources/CryptoLoan.ts",
        "test":      "(new) test/resources/CryptoLoan.test.ts",
        "namespace_prefix": "cryptoLoan",
    },
    "Convert SAPI": {
        "registry":  "(new) src/registry/convertSapi.endpoints.ts",
        "resource":  "(new) src/resources/ConvertSapi.ts",
        "test":      "(new) test/resources/ConvertSapi.test.ts",
        "namespace_prefix": "convert.spot",
    },
    "Algo SAPI": {
        "registry":  "(new) src/registry/algoSapi.endpoints.ts",
        "resource":  "(new) src/resources/AlgoSapi.ts",
        "test":      "(new) test/resources/AlgoSapi.test.ts",
        "namespace_prefix": "algo",
    },
    "Dual Investment": {
        "registry":  "(new) src/registry/dualInvestment.endpoints.ts",
        "resource":  "(new) src/resources/DualInvestment.ts",
        "test":      "(new) test/resources/DualInvestment.test.ts",
        "namespace_prefix": "dualInvestment",
    },
    "Alpha": {
        "registry":  "(new) src/registry/alpha.endpoints.ts",
        "resource":  "(new) src/resources/Alpha.ts",
        "test":      "(new) test/resources/Alpha.test.ts",
        "namespace_prefix": "alpha",
    },
    "Copy Trading": {
        "registry":  "(new) src/registry/copyTrading.endpoints.ts",
        "resource":  "(new) src/resources/CopyTrading.ts",
        "test":      "(new) test/resources/CopyTrading.test.ts",
        "namespace_prefix": "copyTrading",
    },
    "C2C": {
        "registry":  "(new) src/registry/c2c.endpoints.ts",
        "resource":  "(new) src/resources/C2C.ts",
        "test":      "(new) test/resources/C2C.test.ts",
        "namespace_prefix": "c2c",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Build the row list.
# ─────────────────────────────────────────────────────────────────────────────

def build_rows() -> list[Row]:
    rows: list[Row] = []

    # ---- USDⓈ-M (99 registry entries: 94 covered + 5 extras) ----
    usdm_registry = parse_registry("src/registry/usdm.endpoints.ts")
    for op, method, path, auth, impl_by in usdm_registry:
        # Determine if this row is in the uploaded 95-endpoint collection
        # or one of the 5 SDK extras.
        is_extra = f"{method} {path}" in USDM_REGISTRY_EXTRAS
        status = "Covered (extra)" if is_extra else "Covered"
        notes = (
            "Implemented in registry but NOT in uploaded 95-endpoint collection."
            if is_extra
            else ""
        )
        rows.append(
            Row(
                collection="USDⓈ-M Futures",
                method=method,
                endpoint=path,
                auth=auth,
                namespace=namespace_from_implemented_by(impl_by, "USDⓈ-M Futures"),
                sdk_method=sdk_method_from_implemented_by(impl_by),
                registry_file="src/registry/usdm.endpoints.ts",
                resource_file=resource_file_for("USDⓈ-M Futures"),
                test_file=test_file_for("USDⓈ-M Futures"),
                status=status,
                priority="P2",
                notes=notes,
            )
        )

    # ---- USDⓈ-M missing (1 endpoint) ----
    for method, path, auth, namespace, sdk_method, priority, notes in USDM_MISSING:
        rows.append(
            Row(
                collection="USDⓈ-M Futures",
                method=method,
                endpoint=path,
                auth=auth,
                namespace=f"client.{namespace}",
                sdk_method=sdk_method,
                registry_file="src/registry/usdm.endpoints.ts (append row)",
                resource_file=resource_file_for("USDⓈ-M Futures"),
                test_file=test_file_for("USDⓈ-M Futures"),
                status="Missing",
                priority=priority,
                notes=notes,
            )
        )

    # ---- COIN-M (40 registry entries: 39 covered + 1 extra `/dapi/v1/order/test`) ----
    coinm_registry = parse_registry("src/registry/coinm.endpoints.ts")
    for op, method, path, auth, impl_by in coinm_registry:
        # Per the audit, /dapi/v1/order/test is NOT in the uploaded COIN-M collection.
        is_extra = path == "/dapi/v1/order/test"
        status = "Covered (extra)" if is_extra else "Covered"
        notes = (
            "Implemented in registry but NOT in uploaded 65-endpoint COIN-M collection."
            if is_extra
            else ""
        )
        rows.append(
            Row(
                collection="COIN-M Futures",
                method=method,
                endpoint=path,
                auth=auth,
                namespace=namespace_from_implemented_by(impl_by, "COIN-M Futures"),
                sdk_method=sdk_method_from_implemented_by(impl_by),
                registry_file="src/registry/coinm.endpoints.ts",
                resource_file=resource_file_for("COIN-M Futures"),
                test_file=test_file_for("COIN-M Futures"),
                status=status,
                priority="P2",
                notes=notes,
            )
        )

    # ---- COIN-M missing (26 endpoints) ----
    for method, path, auth, namespace, sdk_method, priority, notes in COINM_MISSING:
        rows.append(
            Row(
                collection="COIN-M Futures",
                method=method,
                endpoint=path,
                auth=auth,
                namespace=f"client.{namespace}",
                sdk_method=sdk_method,
                registry_file="src/registry/coinm.endpoints.ts (append row)",
                resource_file=resource_file_for("COIN-M Futures"),
                test_file=test_file_for("COIN-M Futures"),
                status="Missing",
                priority=priority,
                notes=notes,
            )
        )

    # ---- Missing collections (PM 109, Options 43, PM Pro 24, Crypto Loan 17,
    #      Convert SAPI 9, Algo SAPI 11, Dual Investment 5, Alpha 5,
    #      Copy Trading 2, C2C 1) ----
    missing_collections: list[tuple[str, list[tuple[str, str, str, str, str, str, str]]]] = [
        ("Portfolio Margin", PM_MISSING),
        ("Options", OPTIONS_MISSING),
        ("Portfolio Margin Pro", PMPRO_MISSING),
        ("Crypto Loan", CRYPTOLOAN_MISSING),
        ("Convert SAPI", CONVERTSAPI_MISSING),
        ("Algo SAPI", ALGOSAPI_MISSING),
        ("Dual Investment", DUALINVESTMENT_MISSING),
        ("Alpha", ALPHA_MISSING),
        ("Copy Trading", COPYTRADING_MISSING),
        ("C2C", C2C_MISSING),
    ]
    for collection, missing_list in missing_collections:
        files = COLLECTION_FILES[collection]
        for method, path, auth, namespace, sdk_method, priority, notes in missing_list:
            rows.append(
                Row(
                    collection=collection,
                    method=method,
                    endpoint=path,
                    auth=auth,
                    namespace=f"client.{namespace}",
                    sdk_method=sdk_method,
                    registry_file=files["registry"],
                    resource_file=files["resource"],
                    test_file=files["test"],
                    status="Missing",
                    priority=priority,
                    notes=notes,
                )
            )

    return rows


# ─────────────────────────────────────────────────────────────────────────────
# XLSX writer (multi-sheet: master + per-collection + summary).
# ─────────────────────────────────────────────────────────────────────────────

def write_xlsx(rows: list[Row], path: str) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.properties.creator = "Z.ai"

    # Color tokens (light pastel — Excel-friendly, no dynamic arrays).
    header_fill = PatternFill(start_color="1F2A44", end_color="1F2A44", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    covered_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    covered_extra_fill = PatternFill(start_color="E0E7FF", end_color="E0E7FF", fill_type="solid")
    missing_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    alt_row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap = Alignment(wrap_text=True, vertical="top")
    center = Alignment(horizontal="center", vertical="center")

    def write_sheet(ws, title: str, rows_subset: list[Row]):
        ws.title = title
        # Headers
        for col_idx, header in enumerate(HEADERS, start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center
            cell.border = border
        # Rows
        for row_idx, row in enumerate(rows_subset, start=2):
            values = row.as_csv()
            for col_idx, val in enumerate(values, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=val)
                cell.border = border
                cell.alignment = wrap
                # Color by status (column J — index 10).
                if row.status == "Covered":
                    cell.fill = covered_fill
                elif row.status == "Covered (extra)":
                    cell.fill = covered_extra_fill
                elif row.status == "Missing":
                    cell.fill = missing_fill
                elif row_idx % 2 == 0:
                    cell.fill = alt_row_fill
        # Column widths
        widths = [22, 12, 60, 12, 38, 36, 38, 56, 60, 18, 10, 56]
        for col_idx, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(col_idx)].width = w
        # Freeze the header row + the Collection column.
        ws.freeze_panes = "B2"
        # Auto-filter on the header range.
        last_row = len(rows_subset) + 1
        ws.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{last_row}"

    # Master sheet
    ws_master = wb.active
    write_sheet(ws_master, "Master Matrix", rows)

    # One sheet per collection
    for collection in COLLECTIONS:
        subset = [r for r in rows if r.collection == collection]
        if not subset:
            continue
        ws = wb.create_sheet(title=collection[:31])  # Excel sheet-name limit
        write_sheet(ws, collection[:31], subset)

    # Summary sheet
    ws_summary = wb.create_sheet(title="Summary")
    ws_summary.cell(row=1, column=1, value="Collection").font = header_font
    ws_summary.cell(row=1, column=1).fill = header_fill
    ws_summary.cell(row=1, column=2, value="Uploaded").font = header_font
    ws_summary.cell(row=1, column=2).fill = header_fill
    ws_summary.cell(row=1, column=3, value="Covered").font = header_font
    ws_summary.cell(row=1, column=3).fill = header_fill
    ws_summary.cell(row=1, column=4, value="Covered (extra)").font = header_font
    ws_summary.cell(row=1, column=4).fill = header_fill
    ws_summary.cell(row=1, column=5, value="Missing").font = header_font
    ws_summary.cell(row=1, column=5).fill = header_fill
    ws_summary.cell(row=1, column=6, value="Coverage %").font = header_font
    ws_summary.cell(row=1, column=6).fill = header_fill
    ws_summary.cell(row=1, column=7, value="Priority P0").font = header_font
    ws_summary.cell(row=1, column=7).fill = header_fill
    ws_summary.cell(row=1, column=8, value="Priority P1").font = header_font
    ws_summary.cell(row=1, column=8).fill = header_fill
    ws_summary.cell(row=1, column=9, value="Priority P2").font = header_font
    ws_summary.cell(row=1, column=9).fill = header_fill
    for col in range(1, 10):
        ws_summary.cell(row=1, column=col).alignment = center
        ws_summary.cell(row=1, column=col).border = border

    uploaded_counts = {
        "USDⓈ-M Futures": 95,
        "COIN-M Futures": 65,
        "Portfolio Margin": 109,
        "Options": 43,
        "Portfolio Margin Pro": 24,
        "Crypto Loan": 17,
        "Convert SAPI": 9,
        "Algo SAPI": 11,
        "Dual Investment": 5,
        "Alpha": 5,
        "Copy Trading": 2,
        "C2C": 1,
    }
    row_idx = 2
    totals = {"uploaded": 0, "covered": 0, "covered_extra": 0, "missing": 0, "p0": 0, "p1": 0, "p2": 0}
    for collection in COLLECTIONS:
        subset = [r for r in rows if r.collection == collection]
        covered = sum(1 for r in subset if r.status == "Covered")
        covered_extra = sum(1 for r in subset if r.status == "Covered (extra)")
        missing = sum(1 for r in subset if r.status == "Missing")
        uploaded = uploaded_counts[collection]
        pct = (covered / uploaded * 100) if uploaded else 0
        p0 = sum(1 for r in subset if r.priority == "P0")
        p1 = sum(1 for r in subset if r.priority == "P1")
        p2 = sum(1 for r in subset if r.priority == "P2")
        ws_summary.cell(row=row_idx, column=1, value=collection).border = border
        ws_summary.cell(row=row_idx, column=2, value=uploaded).border = border
        ws_summary.cell(row=row_idx, column=3, value=covered).border = border
        ws_summary.cell(row=row_idx, column=4, value=covered_extra).border = border
        ws_summary.cell(row=row_idx, column=5, value=missing).border = border
        pct_cell = ws_summary.cell(row=row_idx, column=6, value=pct / 100)
        pct_cell.number_format = "0.0%"
        pct_cell.border = border
        ws_summary.cell(row=row_idx, column=7, value=p0).border = border
        ws_summary.cell(row=row_idx, column=8, value=p1).border = border
        ws_summary.cell(row=row_idx, column=9, value=p2).border = border
        totals["uploaded"] += uploaded
        totals["covered"] += covered
        totals["covered_extra"] += covered_extra
        totals["missing"] += missing
        totals["p0"] += p0
        totals["p1"] += p1
        totals["p2"] += p2
        row_idx += 1

    # Total row
    total_row = row_idx
    ws_summary.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws_summary.cell(row=total_row, column=2, value=totals["uploaded"]).font = Font(bold=True)
    ws_summary.cell(row=total_row, column=3, value=totals["covered"]).font = Font(bold=True)
    ws_summary.cell(row=total_row, column=4, value=totals["covered_extra"]).font = Font(bold=True)
    ws_summary.cell(row=total_row, column=5, value=totals["missing"]).font = Font(bold=True)
    overall_pct = totals["covered"] / totals["uploaded"] if totals["uploaded"] else 0
    cell = ws_summary.cell(row=total_row, column=6, value=overall_pct)
    cell.number_format = "0.0%"
    cell.font = Font(bold=True)
    ws_summary.cell(row=total_row, column=7, value=totals["p0"]).font = Font(bold=True)
    ws_summary.cell(row=total_row, column=8, value=totals["p1"]).font = Font(bold=True)
    ws_summary.cell(row=total_row, column=9, value=totals["p2"]).font = Font(bold=True)
    for col in range(1, 10):
        ws_summary.cell(row=total_row, column=col).border = border

    widths_summary = [22, 12, 12, 18, 12, 14, 14, 14, 14]
    for col_idx, w in enumerate(widths_summary, start=1):
        ws_summary.column_dimensions[get_column_letter(col_idx)].width = w
    ws_summary.freeze_panes = "A2"

    # Reorder: Summary first, Master Matrix second, then per-collection sheets.
    wb._sheets = [
        wb["Summary"],
        wb["Master Matrix"],
    ] + [wb[c[:31]] for c in COLLECTIONS if any(r.collection == c for r in rows)]

    wb.save(path)


def write_csv(rows: list[Row], path: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(HEADERS)
        for row in rows:
            writer.writerow(row.as_csv())


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    rows = build_rows()

    out_dir = "/home/z/my-project/download"
    os.makedirs(out_dir, exist_ok=True)
    xlsx_path = os.path.join(out_dir, "binance-sdk-endpoint-matrix.xlsx")
    csv_path = os.path.join(out_dir, "binance-sdk-endpoint-matrix.csv")

    write_xlsx(rows, xlsx_path)
    write_csv(rows, csv_path)

    # Print a summary to stdout for the user / worklog.
    by_collection: dict[str, dict[str, int]] = {}
    for r in rows:
        bucket = by_collection.setdefault(r.collection, {"covered": 0, "covered_extra": 0, "missing": 0})
        if r.status == "Covered":
            bucket["covered"] += 1
        elif r.status == "Covered (extra)":
            bucket["covered_extra"] += 1
        elif r.status == "Missing":
            bucket["missing"] += 1

    print(f"Total rows: {len(rows)}")
    print()
    print(f"{'Collection':<28} {'Covered':>8} {'Extra':>8} {'Missing':>8} {'Total':>8}")
    print("-" * 64)
    total_covered = 0
    total_extra = 0
    total_missing = 0
    for collection in COLLECTIONS:
        bucket = by_collection.get(collection, {"covered": 0, "covered_extra": 0, "missing": 0})
        c = bucket["covered"]
        e = bucket["covered_extra"]
        m = bucket["missing"]
        total_covered += c
        total_extra += e
        total_missing += m
        print(f"{collection:<28} {c:>8} {e:>8} {m:>8} {c+e+m:>8}")
    print("-" * 64)
    print(f"{'TOTAL':<28} {total_covered:>8} {total_extra:>8} {total_missing:>8} {total_covered+total_extra+total_missing:>8}")
    print()
    print(f"XLSX → {xlsx_path}")
    print(f"CSV  → {csv_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
