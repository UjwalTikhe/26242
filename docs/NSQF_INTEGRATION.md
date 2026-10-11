# Integration Pathway: Diagnostic Device Use into NSQF Assessment Criteria

**Version:** 1.0
**Date:** 2026-10-12
**Purpose:** Document how sensor-based diagnostic tools can be integrated into National Skills Qualifications Framework (NSQF) assessment criteria for vocational trades

---

## Executive Summary

This document outlines a structured pathway for integrating low-cost diagnostic sensing devices into the NSQF assessment framework for vocational trades (plumbing, electrical, welding, etc.). The integration ensures that trainees develop sensor-based diagnostic skills as part of their competency assessment, aligning with modern industry practices and safety standards.

---

## Current NSQF Assessment Landscape

### Existing Assessment Methods

| Trade | Current Assessment Methods | Gaps Identified |
|-------|---------------------------|-----------------|
| **Plumber (PSC/Q0104)** | Practical pipe fitting, leak detection with soap solution, pressure testing | Manual, experience-based; no instrumented diagnostics for novices |
| **Electrician** | Circuit testing with multimeter, fault diagnosis | Limited sensor-based training; no real-time hazard monitoring |
| **Welder** | Practical welding test, visual inspection | No proximity/UV exposure monitoring during training |
| **Mason (CON/Q0103)** | Brick laying, structural assessment | No sensor-based quality monitoring |

### Assessment Structure (Current)

1. **Theory Assessment:** MCQs on safety, standards, procedures
2. **Practical Assessment:** Task performance evaluated by assessor
3. **Tool Identification:** Manual identification of tools
4. **Checklist:** Self-reported step completion
5. **Photo/Video Evidence:** Manual documentation

---

## Proposed Integration Model

### Phase 1: Diagnostic Device as Supplementary Evidence (6 months)

**Objective:** Introduce diagnostic devices as optional supplementary evidence for enhanced assessment

**Integration Points:**

1. **Leak Detection (Plumber)**
   - **NSQF Unit:** "Detect and repair leaks in water supply systems"
   - **Current Method:** Soap solution + visual inspection
   - **Device Integration:** Acoustic sensor + pressure sensor readings
   - **Assessment Criteria:**
     - Trainee uses device to locate leak (sensor data logged)
     - Pressure readings before/after repair documented
     - Device data reviewed by assessor for accuracy

2. **Welding Safety (Welder)**
   - **NSQF Unit:** "Perform welding operations with safety precautions"
   - **Current Method:** Visual observation of PPE and technique
   - **Device Integration:** UV sensor + temperature sensor + gas sensor
   - **Assessment Criteria:**
     - Continuous monitoring of UV exposure during welding
     - Safe distance verification (proximity sensor)
     - Gas concentration monitoring in workspace
     - Alerts acknowledged and acted upon

**Implementation:**
- Add "Diagnostic Evidence" task type to assessment plans
- Trainees can optionally use device during practical tasks
- Device data submitted as supplementary evidence
- Assessor reviews sensor data alongside manual assessment
- No change to NSQF standards; only enhancement

---

### Phase 2: Diagnostic Device as Mandatory Component (12 months)

**Objective:** Make diagnostic device use mandatory for specific NSQF units

**Integration Points:**

1. **Revised Assessment Plans**
   - New task type: "Sensor-Based Diagnostic"
   - Mandatory for NSQF units involving:
     - Leak detection (Plumber)
     - Hazard monitoring (Welder)
     - Electrical fault detection (Electrician)

2. **New Performance Criteria**
   - **Plumber (PSC/Q0104):**
     - "Use acoustic sensor to detect water leaks with 90% accuracy"
     - "Monitor pressure readings and identify anomalies"
     - "Document leak location using sensor coordinates"

   - **Welder:**
     - "Maintain safe distance from welding arc (verified by proximity sensor)"
     - "Respond appropriately to UV exposure alerts"
     - "Monitor gas levels in welding environment"

3. **Scoring Integration**
   - Sensor accuracy becomes part of overall score (10-15% weight)
   - Response time to alerts measured and scored
   - Data completeness considered in assessment

**Implementation:**
- Update trade pack JSON files with sensor-based tasks
- Modify scoring engine to include sensor metrics
- Train assessors on device usage and data interpretation
- Update certification criteria to include sensor competency

---

### Phase 3: Full NSQF Standard Revision (18-24 months)

**Objective:** Revise NSQF standards to formally include sensor-based diagnostic skills

**Integration Points:**

1. **Standard Revision Process**
   - Collaborate with Sector Skill Councils (SSCs)
   - Submit revision proposals to Ministry of Skill Development
   - Pilot revised standards in select ITIs
   - Gather feedback and refine

2. **New NSQF Performance Criteria Examples**

   **Plumber - Level 4 (PSC/Q0104):**
   ```
   PC 3.4: Use instrumented diagnostic tools to detect and locate leaks
   - Operate acoustic leak detection device
   - Interpret sensor readings and pressure graphs
   - Document leak severity using quantitative data
   - Integrate sensor findings with manual inspection
   ```

   **Welder - Level 3:**
   ```
   PC 2.7: Monitor and respond to hazard alerts during welding operations
   - Wear hazard monitoring device during welding
   - Interpret UV, temperature, and gas sensor alerts
   - Maintain safe working distances as indicated by proximity sensors
   - Respond appropriately to critical hazard alerts
   ```

3. **Assessment Protocol Updates**
   - Device usage becomes mandatory for certification
   - Sensor data submitted as primary evidence for specific units
   - Automated safety violation tracking
   - Trainer competency in device usage verified

**Implementation:**
- Formal NSQF standard revision submitted
- New assessment protocols approved
- All ITIs equipped with diagnostic devices
- Assessors certified on device usage
- Industry acceptance of sensor-based certifications

---

## Technical Integration into DakshSetu Platform

### 1. Trade Pack Configuration

Update existing trade pack JSON files to include sensor-based tasks:

```json
{
  "sensorTasks": [
    {
      "id": "leak_detection_acoustic",
      "type": "sensor_diagnostic",
      "title": "Acoustic Leak Detection",
      "nosRef": "PSC/Q0104/NOS.3.4",
      "sensorsRequired": ["acoustic", "pressure"],
      "deviceType": "handheld",
      "performanceCriteria": {
        "accuracyThreshold": 0.9,
        "responseTimeMax": 30,
        "dataCompleteness": 0.95
      },
      "weight": 15
    }
  ]
}
```

### 2. Assessment Plan Generation

Modify plan generation algorithm to:
- Include sensor-based tasks when applicable
- Link sensor tasks to NSQF performance criteria
- Assign appropriate weight to sensor metrics
- Ensure device availability before including sensor tasks

### 3. Scoring Engine Enhancement

Add sensor data scoring logic:
- Calculate accuracy from sensor readings vs. ground truth
- Measure response time to alerts
- Evaluate data completeness and quality
- Flag safety violations for critical review

### 4. Competency Report Updates

Include sensor competency sections:
- Sensor usage proficiency score
- Safety compliance metrics
- Hazard response time statistics
- Comparison with industry benchmarks

### 5. Certificate Endorsement

Add device competency endorsement:
- "Assessed with sensor-based diagnostic tools"
- Specific sensors used in assessment
- Safety compliance certification
- QR code linking to sensor data log

---

## Training Infrastructure Requirements

### 1. ITI Equipment Requirements

| Trade | Device Type | Quantity per ITI | Cost Estimate |
|-------|-------------|------------------|---------------|
| Plumber | Handheld Leak Detector | 5 | ₹12,500 |
| Welder | Wearable Hazard Monitor | 5 | ₹17,500 |
| Electrician | Multi-Meter with Sensor | 5 | ₹15,000 |
| Mason | Fixed Quality Station | 1 | ₹12,000 |

### 2. Trainer Training Program

**Module 1: Device Fundamentals (8 hours)**
- Device operation and calibration
- Sensor types and applications
- Data interpretation basics
- Troubleshooting common issues

**Module 2: Assessment Integration (8 hours)**
- Linking device data to NSQF criteria
- Using device data in assessment reviews
- Interpreting sensor-based evidence
- Providing feedback on sensor performance

**Module 3: Safety Protocols (4 hours)**
- Occupational safety thresholds
- Alert response procedures
- Emergency protocols
- Legal and ethical considerations

### 3. Trainee Orientation

**Induction Session (2 hours)**
- Introduction to diagnostic devices
- Benefits for skill development
- Safety implications
- Career relevance

**Practice Sessions (Integrated into curriculum)**
- Device handling drills
- Simulated diagnostic scenarios
- Alert response practice
- Data logging procedures

---

## Safety Threshold Framework

### Occupational Safety Standards Reference

| Hazard | Standard Reference | Threshold | Monitoring Method |
|--------|-------------------|-----------|-------------------|
| UV Exposure | OSHA 1910.133 | 0.24 mW/cm² (8hr) | UV sensor cumulative |
| Gas Concentration (LPG) | BIS IS 6044 | 1000 ppm (LEL) | Gas sensor continuous |
| Temperature Proximity | OSHA 1910.132 | 50°C (skin contact) | IR temperature sensor |
| Pressure (Water) | BIS IS 2062 | 10 bar (domestic) | Pressure sensor |
| CO Exposure | OSHA 1910.1000 | 50 ppm (8hr TWA) | CO sensor |

### Integration into Assessment

1. **Threshold-Based Scoring**
   - Safe operation: Full marks
   - Warning threshold breached: 10% deduction
   - Danger threshold breached: 20% deduction
   - Critical threshold breached: Safety veto (fail)

2. **Violation Tracking**
   - All violations logged with timestamp
   - Assessor review required for resolution
   - Pattern analysis for safety compliance
   - Retraining recommended for repeat violations

3. **Certification Requirements**
   - Zero critical violations during assessment
   - Response time < 30 seconds for all alerts
   - 95% compliance with safety thresholds
   - Corrective actions documented

---

## Quality Assurance Framework

### 1. Device Calibration Protocol

- **Frequency:** Quarterly calibration
- **Authority:** NABL-accredited lab
- **Documentation:** Calibration certificates stored
- **Traceability:** Devices linked to calibration records

### 2. Data Integrity Measures

- **Tamper Detection:** Hash chain for sensor readings
- **Audit Trail:** All data modifications logged
- **Backup:** Cloud storage with redundancy
- **Verification:** Random spot-checks of device accuracy

### 3. Assessment Validation

- **Inter-rater Reliability:** Assessors trained on consistent interpretation
- **Device Accuracy:** 95% minimum accuracy requirement
- **Edge Case Handling:** Documented procedures for anomalies
- **Appeal Process:** Mechanism for challenging sensor-based scores

---

## Timeline and Milestones

### Year 1: Foundation

**Q1-Q2:**
- [ ] Finalize device specifications and BOM
- [ ] Build 20 prototype devices
- [ ] Develop sensor integration API
- [ ] Train pilot assessors

**Q3-Q4:**
- [ ] Pilot in 5 ITIs (one per region)
- [ ] Collect feedback and refine
- [ ] Develop training materials
- [ ] Submit Phase 1 integration proposal to SSCs

### Year 2: Expansion

**Q1-Q2:**
- [ ] Scale to 50 ITIs
- [ ] Implement Phase 2 (mandatory device use)
- [ ] Update trade packs with sensor tasks
- [ ] Certify 100 assessors on device usage

**Q3-Q4:**
- [ ] Gather performance data
- [ ] Analyze impact on assessment outcomes
- [ ] Draft NSQF standard revision proposal
- [ ] Industry consultation and validation

### Year 3: Full Integration

**Q1-Q2:**
- [ ] Submit NSQF revision to Ministry
- [ ] Deploy to 200 ITIs
- [ ] Implement full sensor-based assessment
- [ ] Establish maintenance ecosystem

**Q3-Q4:**
- [ ] National rollout completion
- [ ] Continuous improvement based on data
- [ ] Publish integration case studies
- [ ] Plan for next-generation devices

---

## Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Device adoption rate | 90% of ITIs equipped | Deployment tracking |
| Assessment accuracy improvement | 15% increase | Comparative study |
| Safety incident reduction | 30% decrease | Incident reporting |
| Trainee satisfaction | 85% positive | Survey data |
| Industry acceptance | 70% employer endorsement | Employer survey |

### Qualitative Metrics

- Enhanced trainee diagnostic skills
- Improved safety culture in training
- Better alignment with industry practices
- Increased confidence in certification
- Data-driven assessment practices

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Device failure during assessment | Backup devices available; manual fallback |
| Sensor accuracy issues | Regular calibration; error margins accounted |
| Data loss | Cloud backup; local caching |
| Cybersecurity threats | Encryption; secure protocols |

### Adoption Risks

| Risk | Mitigation |
|------|------------|
| Resistance from trainers | Comprehensive training; incentives |
| Cost concerns | Phased rollout; government funding |
| Regulatory delays | Early engagement with authorities |
| Industry skepticism | Pilot results; advocacy campaign |

---

## Conclusion

The integration of diagnostic sensing devices into NSQF assessment criteria represents a significant modernization of vocational training in India. By following this phased pathway, the implementation can be managed effectively, ensuring:

1. **Skill Enhancement:** Trainees develop modern diagnostic competencies
2. **Safety Improvement:** Real-time hazard monitoring reduces incidents
3. **Assessment Quality:** Data-driven, objective evaluation
4. **Industry Alignment:** Skills match contemporary workplace practices
5. **Scalability:** Cost-effective deployment across national network

The DakshSetu platform provides the technical foundation for this integration, with its existing assessment infrastructure being extended to support sensor-based evidence collection and analysis.

---

## Appendices

### Appendix A: Sample Sensor-Based Assessment Task

```json
{
  "taskId": "plumber_leak_detection_001",
  "type": "sensor_diagnostic",
  "title": "Acoustic Leak Detection in Water Supply",
  "brief": "Use handheld acoustic sensor to detect and locate water leak in pipe network",
  "nosRef": "PSC/Q0104/NOS.3.4",
  "criterionRef": "3.4.2",
  "weight": 15,
  "criticalSafety": true,
  "sensorsRequired": ["acoustic", "pressure"],
  "deviceType": "handheld",
  "performanceCriteria": {
    "accuracyThreshold": 0.9,
    "responseTimeMax": 30,
    "dataCompleteness": 0.95,
    "safetyCompliance": 1.0
  },
  "scoring": {
    "accuracy": 5,
    "responseTime": 3,
    "dataQuality": 4,
    "safety": 3
  }
}
```

### Appendix B: Sample Safety Threshold Configuration

```json
{
  "sensorType": "uv",
  "tradePackId": "welder",
  "name": "UV Exposure Limit for Welding",
  "standardRef": "OSHA 1910.133",
  "maxSafe": 0.24,
  "unit": "mW/cm²",
  "warningThreshold": 0.7,
  "criticalThreshold": 0.9,
  "durationLimitSec": 28800,
  "notes": "8-hour Time Weighted Average limit"
}
```

### Appendix C: Stakeholder Engagement Plan

| Stakeholder | Engagement Strategy | Timeline |
|-------------|---------------------|----------|
| Sector Skill Councils | Technical working group; pilot validation | Q1-Q2 Year 1 |
| ITI Principals | Orientation sessions; funding proposals | Q2 Year 1 |
| Trainers | Training workshops; certification | Q3 Year 1 |
| Industry Partners | Advisory board; employment linkage | Q4 Year 1 |
| Government Officials | Policy briefings; demonstration | Q1 Year 2 |
| Trainees | Information sessions; career guidance | Ongoing |
