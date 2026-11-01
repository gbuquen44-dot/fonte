#!/usr/bin/env python3
"""Builds the "Fonte Sante" iPhone shortcut and signs it.

The shortcut reads the last days of Apple Health (steps, food, weight) and
drops one small text file in the inbox of the private data repository. The app
reads that inbox and empties it. Grouping by day gives Health's own daily
totals, so nothing is counted twice.

Line format: key, date, value, separated by tabs.
"""
import os
import plistlib
import subprocess
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
NAME = "Fonte Sante"
REPO = "gbuquen44-dot/fonte-data"
DAYS = 3
METRICS = [
    ("Steps", "steps"),
    ("Dietary Energy", "kcal"),
    ("Protein", "protein"),
    ("Carbohydrates", "carbs"),
    ("Total Fat", "fat"),
    ("Weight", "weight"),
]


def uid():
    return str(uuid.uuid4()).upper()


def output(uuid_str, name):
    return {"Value": {"OutputUUID": uuid_str, "Type": "ActionOutput", "OutputName": name},
            "WFSerializationType": "WFTextTokenAttachment"}


def repeat_item():
    return {"Value": {"Type": "Variable", "VariableName": "Repeat Item"},
            "WFSerializationType": "WFTextTokenAttachment"}


def text(parts):
    """A token string from literal strings and (uuid, name) outputs."""
    string = ""
    ranges = {}
    for part in parts:
        if isinstance(part, str):
            string += part
        else:
            ranges["{%d, 1}" % len(string)] = {"OutputUUID": part[0], "Type": "ActionOutput", "OutputName": part[1]}
            string += "￼"
    value = {"string": string}
    if ranges:
        value["attachmentsByRange"] = ranges
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def field(items):
    """A key and value table, for request headers and the JSON body."""
    return {
        "Value": {"WFDictionaryFieldValueItems": [
            {"WFItemType": 0, "WFKey": text([k]), "WFValue": text(v if isinstance(v, list) else [v])}
            for k, v in items
        ]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}


def puid(act):
    return act["WFWorkflowActionParameters"]["UUID"]


def find(label):
    return action("is.workflow.actions.filter.health.quantity", {
        "UUID": uid(),
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {"Bounded": True, "Operator": 4, "Property": "Type", "Removable": False,
                     "Values": {"Enumeration": {"Value": label, "WFSerializationType": "WFStringSubstitutableState"}}},
                    {"Bounded": True, "Operator": 1001, "Property": "Start Date", "Removable": False,
                     "Values": {"Number": DAYS, "Unit": 16}},
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Oldest First",
        "WFContentItemLimitEnabled": False,
        "WFContentItemLimitNumber": 20,
        "WFHKSampleFilteringFillMissing": False,
        "WFHKSampleFilteringGroupBy": "Day",
    })


def detail(name):
    return action("is.workflow.actions.properties.health.quantity", {
        "UUID": uid(), "WFContentItemPropertyName": name, "WFInput": repeat_item(), "CustomOutputName": name,
    })


def format_date(source, name, pattern):
    return action("is.workflow.actions.format.date", {
        "UUID": uid(), "WFDate": text([(source, name)]), "WFDateFormatStyle": "Custom",
        "WFDateFormat": pattern, "WFTimeFormatStyle": "Short",
    })


def get_text(parts):
    return action("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": text(parts)})


def block(label, key):
    """One Find, one loop, one line per day. Returns (actions, result uuid)."""
    found = find(label)
    group = uid()
    start = detail("Start Date")
    day = format_date(puid(start), "Start Date", "yyyy-MM-dd")
    value = detail("Value")
    line = get_text([key, "\t", (puid(day), "Formatted Date"), "\t", (puid(value), "Value")])
    end = uid()
    combined = action("is.workflow.actions.text.combine", {
        "UUID": uid(), "WFTextSeparator": "New Lines", "text": output(end, "Repeat Results"),
    })
    return [
        found,
        action("is.workflow.actions.repeat.each", {
            "GroupingIdentifier": group, "WFControlFlowMode": 0,
            "WFInput": {"Value": {"OutputUUID": puid(found), "Type": "ActionOutput", "OutputName": "Health Samples",
                                  "Aggrandizements": [{"CoercionItemClass": "WFHKSampleContentItem",
                                                       "Type": "WFCoercionVariableAggrandizement"}]},
                        "WFSerializationType": "WFTextTokenAttachment"},
        }),
        start, day, value, line,
        action("is.workflow.actions.repeat.each", {"GroupingIdentifier": group, "WFControlFlowMode": 2, "UUID": end}),
        combined,
    ], puid(combined)


def build():
    token = action("is.workflow.actions.gettext", {"UUID": uid(), "WFTextActionText": "COLLE-TON-JETON-ICI"})
    actions = [token]
    sections = []
    for label, key in METRICS:
        acts, result = block(label, key)
        actions += acts
        sections.append(result)
    parts = ["fonte-sante 1\n"]
    for result in sections:
        parts += [(result, "Combined Text"), "\n"]
    body = get_text(parts)
    encoded = action("is.workflow.actions.base64encode", {
        "UUID": uid(), "WFInput": output(puid(body), "Text"), "WFBase64LineBreakMode": "None", "WFEncodeMode": "Encode",
    })
    now = action("is.workflow.actions.date", {"UUID": uid(), "WFDateActionMode": "Current Date"})
    stamp = format_date(puid(now), "Date", "yyyy-MM-dd-HHmmss")
    send = action("is.workflow.actions.downloadurl", {
        "UUID": uid(),
        "ShowHeaders": True,
        "WFURL": text(["https://api.github.com/repos/%s/contents/health/inbox/" % REPO, (puid(stamp), "Formatted Date"), ".txt"]),
        "WFHTTPMethod": "PUT",
        "WFHTTPBodyType": "JSON",
        "WFHTTPHeaders": field([
            ("Authorization", ["Bearer ", (puid(token), "Text")]),
            ("Accept", "application/vnd.github+json"),
            ("X-GitHub-Api-Version", "2022-11-28"),
        ]),
        "WFJSONValues": field([("message", "Sante"), ("content", [(puid(encoded), "Base64 Encoded")])]),
    })
    actions += [body, encoded, now, stamp, send]
    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "3100.0.4.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 2071128575, "WFWorkflowIconGlyphNumber": 59443},
        "WFWorkflowImportQuestions": [{
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": "Colle ton jeton GitHub (Fonte, Réglages, Brancher Santé et Yazio)",
        }],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowNoInputBehavior": {"Name": "WFWorkflowNoInputBehaviorShowError", "Parameters": {}},
    }


def main():
    work = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
    unsigned = os.path.join(work, NAME + ".unsigned.shortcut")
    signed = os.path.join(OUT, NAME + ".shortcut")
    with open(unsigned, "wb") as f:
        plistlib.dump(build(), f, fmt=plistlib.FMT_BINARY)
    print("%d actions" % len(build()["WFWorkflowActions"]))
    proc = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", signed],
                          capture_output=True, text=True)
    print((proc.stdout + proc.stderr).strip()[:600] or "signed")
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
