import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLUnionType,
  visitWithTypeInfo,
  TypeInfo,
  visit,
  getNamedType,
  isIntrospectionType,
  isEnumType
} from 'graphql';
import { SchemaTemplateContext, DocumentFile } from '../types';
import { objectMapToArray } from '../utils/object-map-to-array';
import { transformGraphQLObject } from './transform-object';
import { transformGraphQLEnum } from './transform-enum';
import { transformUnion } from './transform-union';
import { transformInterface } from './transform-interface';
import { transformScalar } from './transform-scalar';
import { debugLog } from '../debugging';
import { transformDirectives } from './transform-directives';
import { getDirectives } from 'graphql-toolkit';

const GRAPHQL_PRIMITIVES = ['String', 'Int', 'Boolean', 'ID', 'Float'];
type GraphQLTypesMap = { [typeName: string]: GraphQLNamedType };

const clearTypes = (typesMap: GraphQLTypesMap, forcedTypes: string[]): GraphQLTypesMap =>
  Object.keys(typesMap)
    .filter(key => forcedTypes.includes(key) || (!GRAPHQL_PRIMITIVES.includes(key) && !key.startsWith('__')))
    .reduce((obj, key) => {
      obj[key] = typesMap[key];
      return obj;
    }, {});

export function schemaToTemplateContext(schema: GraphQLSchema, documents?: DocumentFile[]): SchemaTemplateContext {
  debugLog('[schemaToTemplateContext] started...');

  const introspectionTypesToInclude = includeIntrospectionTypes(schema, documents);

  const directives = getDirectives(schema, schema);
  const result: SchemaTemplateContext = {
    types: [],
    inputTypes: [],
    enums: [],
    unions: [],
    scalars: [],
    interfaces: [],
    definedDirectives: [],
    // Indicators
    hasTypes: false,
    hasInputTypes: false,
    hasEnums: false,
    hasUnions: false,
    hasScalars: false,
    hasInterfaces: false,
    hasDefinedDirectives: false,
    rawSchema: schema,
    directives,
    usesDirectives: Object.keys(directives).length > 0
  };

  const rawTypesMap = schema.getTypeMap();
  const typesMap = clearTypes(rawTypesMap, introspectionTypesToInclude.map(t => t.name));
  const typesArray = objectMapToArray<GraphQLNamedType>(typesMap);

  debugLog(`[schemaToTemplateContext] Got total of ${typesArray.length} types in the GraphQL schema`);

  typesArray.map((graphQlType: { key: string; value: GraphQLNamedType }) => {
    const actualTypeDef = graphQlType.value;

    if (actualTypeDef instanceof GraphQLObjectType) {
      result.types.push(transformGraphQLObject(schema, actualTypeDef));
    } else if (actualTypeDef instanceof GraphQLInputObjectType) {
      result.inputTypes.push(transformGraphQLObject(schema, actualTypeDef));
    } else if (actualTypeDef instanceof GraphQLEnumType) {
      result.enums.push(transformGraphQLEnum(schema, actualTypeDef));
    } else if (actualTypeDef instanceof GraphQLUnionType) {
      result.unions.push(transformUnion(schema, actualTypeDef));
    } else if (actualTypeDef instanceof GraphQLInterfaceType) {
      result.interfaces.push(transformInterface(schema, actualTypeDef));
    } else if (actualTypeDef instanceof GraphQLScalarType) {
      result.scalars.push(transformScalar(schema, actualTypeDef));
    } else {
      throw new Error(
        `Unexpected GraphQL type definition: ${graphQlType.key} (As string: ${String(actualTypeDef)}).` +
          `Please check that you are importing only one instance of the 'graphql' package.`
      );
    }
  });

  result.definedDirectives = transformDirectives(schema, schema.getDirectives() || []);

  result.hasTypes = result.types.length > 0;
  result.hasInputTypes = result.inputTypes.length > 0;
  result.hasEnums = result.enums.length > 0;
  result.hasUnions = result.unions.length > 0;
  result.hasScalars = result.scalars.length > 0;
  result.hasInterfaces = result.interfaces.length > 0;
  result.hasDefinedDirectives = result.definedDirectives.length > 0;

  debugLog(`[schemaToTemplateContext] done, results is: `, result);

  return result;
}

function includeIntrospectionTypes(schema: GraphQLSchema, documents?: DocumentFile[]): GraphQLNamedType[] {
  let typesToInclude: GraphQLNamedType[] = [];

  if (documents) {
    const typeInfo = new TypeInfo(schema);
    const visitor = visitWithTypeInfo(typeInfo, {
      Field() {
        const type = getNamedType(typeInfo.getType());

        if (isIntrospectionType(type) && isEnumType(type) && !typesToInclude.includes(type)) {
          typesToInclude.push(type);
        }
      }
    });

    documents.forEach(doc => visit(doc.content, visitor));
  }

  return typesToInclude;
}
