/**
 * The subset of the SARIF 2.1.0 object model Clear A11Y emits.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
export type SarifLevel = 'none' | 'note' | 'warning' | 'error';

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export type SarifPropertyBag = Record<string, unknown> & { tags?: string[] };

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifLogicalLocation {
  name: string;
  fullyQualifiedName?: string;
  kind?: string;
  properties?: SarifPropertyBag;
}

export interface SarifLocation {
  physicalLocation?: SarifPhysicalLocation;
  logicalLocations?: SarifLogicalLocation[];
}

export interface SarifReportingDescriptor {
  id: string;
  name?: string;
  shortDescription?: SarifMessage;
  fullDescription?: SarifMessage;
  help?: SarifMessage;
  helpUri?: string;
  defaultConfiguration?: { level: SarifLevel };
  properties?: SarifPropertyBag;
}

export interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: SarifLevel;
  message: SarifMessage;
  locations: SarifLocation[];
  partialFingerprints?: Record<string, string>;
  properties?: SarifPropertyBag;
}

export interface SarifNotification {
  level: SarifLevel;
  message: SarifMessage;
  descriptor?: { id: string };
  properties?: SarifPropertyBag;
}

export interface SarifInvocation {
  executionSuccessful: boolean;
  startTimeUtc?: string;
  endTimeUtc?: string;
  toolExecutionNotifications?: SarifNotification[];
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version?: string;
      semanticVersion?: string;
      informationUri?: string;
      rules: SarifReportingDescriptor[];
    };
  };
  originalUriBaseIds?: Record<string, SarifArtifactLocation>;
  invocations?: SarifInvocation[];
  results: SarifResult[];
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}
