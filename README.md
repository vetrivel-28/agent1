# ProfitStory Market Intelligence Agent

A deterministic pre-launch Market Intelligence platform built for Amazon product research and category evaluation.

The system analyzes market demand, competition, pricing, search behavior, ecosystem opportunities, and market structure using uploaded datasets.

No LLMs are used for calculations. All outputs are fully dataset-driven, reproducible, and traceable.

---

## Overview

This project helps sellers, brands, and researchers evaluate a market before launching a product.

The platform combines:

* FastAPI backend
* React + TypeScript dashboard
* Swagger API testing
* PDF report generation
* Deterministic analytics engines

---

## Core Features

### Demand Intelligence

Analyze overall market demand using:

* Search Volume
* Keyword Sales
* ASIN Sales
* Revenue

Outputs:

* Demand Score
* Top Demand Keywords
* Market Demand Strength

---

### Sales Momentum

Brand-level sales growth analysis.

Outputs:

* Sales Momentum Score
* Fast Growing Brands
* Declining Brands
* Growth Rankings

---

### Revenue Momentum

Brand-level revenue trend analysis.

Outputs:

* Revenue Momentum Score
* Revenue Leaders
* Revenue Trend Analysis

---

### BSR Efficiency

Measures how effectively products convert rank into revenue.

Formula:

Efficiency Score =
(Revenue Score × 0.6)
+
(Inverse BSR Score × 0.4)

Outputs:

* Efficiency Rankings
* Best Performing Products
* Market Efficiency Score

---

### Demand Velocity

Measures how quickly market demand is accelerating.

Uses normalized:

* Sales Trend
* Search Trend
* YoY Trend

Outputs:

* Velocity Score
* Market Phase
* Accelerators
* Decelerators

---

### Search Momentum

Tracks search growth and demand acceleration.

Uses:

* Search Volume Trend
* Sales Volume Trend
* Sales Trend

Outputs:

* Search Momentum Score
* Growth Keywords
* Weak Keywords

---

### Search Intent Efficiency (SIEI)

Formula:

SIEI =
ABA Total Conversion Share
/
ABA Total Click Share

Purpose:

Identify keywords receiving clicks but failing to convert.

Outputs:

* Intent Efficiency Score
* Weak Conversion Keywords
* Efficient Keywords

---

### Market Concentration (HHI)

Measures market dominance and fragmentation.

Formula:

HHI =
Σ(Market Share²)

Outputs:

* HHI Score
* Concentration Level
* Fragmentation Analysis

---

## Opportunity Intelligence

### Whitespace Opportunities

Find high-demand, low-competition keyword opportunities.

Uses:

* Search Volume
* Title Density

Outputs:

* Opportunity Score
* High Opportunity Keywords
* Opportunity Heatmaps

---

### Price Elasticity Analysis

Analyzes how demand behaves across pricing tiers.

Outputs:

* Price Buckets
* Revenue by Price Range
* Dead Zones
* Highest Demand Buckets

---

## Competitor Intelligence

### Direct Competitor Analysis

Identifies products competing in the same category.

Uses:

* Category
* Subcategory
* Price Range

Outputs:

* Direct Competitor List
* Competition Density
* Positioning Analysis

---

### Substitute Intelligence

Maps substitute products stealing customer demand.

Uses:

* Keyword Classification
* Product Title Matching

Outputs:

* Substitute Products
* Market Overlap
* Substitute Threats

---

## Ecosystem Intelligence

### Complement Intelligence

Identifies complementary products.

Uses:

* Keyword Classification
* Product Matching

Outputs:

* Cross-Sell Opportunities
* Complement Products
* Ecosystem Relationships

---

### Bundle Opportunity Analysis

Builds bundle opportunities from complement products.

Outputs:

* Bundle Candidates
* Bundle Scores
* Ecosystem Strength

---

## Market Report

Generate executive-level market reports.

Includes:

* Executive Summary
* Demand Analysis
* Momentum Analysis
* Search Intelligence
* Market Structure
* Competitor Analysis
* Ecosystem Analysis
* Opportunity Analysis
* Risk Analysis
* Final Market Verdict

---

## Dashboard

Interactive React dashboard with:

* KPI Cards
* Rankings
* Heatmaps
* Scatter Plots
* Treemaps
* Search Tables
* CSV Export
* PDF Export

---

## API Endpoints

### Dataset Management

POST /api/v1/upload-datasets

---

### Core Intelligence

POST /api/v1/demand-strength

POST /api/v1/sales-momentum

POST /api/v1/revenue-momentum

POST /api/v1/bsr-efficiency

POST /api/v1/demand-velocity

POST /api/v1/search-momentum

POST /api/v1/search-intent-efficiency

POST /api/v1/market-concentration

---

### Opportunity Intelligence

POST /api/v1/whitespace-opportunities

POST /api/v1/price-elasticity

---

### Competitor Intelligence

POST /api/v1/direct-competitors

POST /api/v1/substitute-intelligence

---

### Ecosystem Intelligence

POST /api/v1/complement-intelligence

POST /api/v1/bundle-opportunities

---

### Reporting

POST /api/v1/market-report

GET /api/v1/market-report/pdf

---

## Technology Stack

Backend

* Python
* FastAPI
* Pandas
* NumPy
* ReportLab

Frontend

* React
* TypeScript
* TailwindCSS
* Recharts
* Vite

---

## Design Principles

* Deterministic calculations
* No hallucinated outputs
* Dataset-driven insights
* Fully reproducible results
* Traceable formulas
* Market-first analysis
* Pre-launch decision support

---

## Current Status

Phase 1 Complete

Modules Implemented:

* Demand Strength
* Sales Momentum
* Revenue Momentum
* BSR Efficiency
* Demand Velocity
* Search Momentum
* SIEI
* Market Concentration
* Whitespace Opportunities
* Direct Competitors
* Price Elasticity
* Substitute Intelligence
* Complement Intelligence
* Bundle Opportunities
* Market Report
* PDF Export
