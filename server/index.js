const express = require('express');
const cors = require('cors')
const XLSX = require('xlsx');

const app = express();

const path = require('path');
const { capitalize } = require('lodash');
const { collapseTextChangeRangesAcrossMultipleVersions } = require('typescript');

app.use(express.static(path.join(__dirname, "..", "build")));
app.use(express.static("public"));
app.use(cors())
// app.use((req, res, next) => {
//     res.sendFile(path.join(__dirname, "..", "build", "index.html"));
// });

const sheetsPaths = {
  2019: {
    escolasUrbanas: {
      alunos: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/1. Escolas urbanas/1. Alunos/tic_educacao_2019_escolas_urbanas_alunos_tabela_total_v1.0.xlsx',
      coordenadores: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/1. Escolas urbanas/2. Coordenadores/tic_educacao_2019_escolas_urbanas_coordenadores_tabela_total_v1.0.xlsx',
      diretores: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/1. Escolas urbanas/3. Diretores/tic_educacao_2019_urbanas_diretores_tabela_total_v1.0.xlsx',
      professores: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/1. Escolas urbanas/4. Professores/tic_educacao_2019_escolas_urbanas_professores_tabela_total_v1.0.xlsx',
      escolas: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/1. Escolas urbanas/5. Escolas/tic_educacao_2019_escolas_urbanas_tabela_total_v1.0.xlsx'
    },
    escolasRurais: {
      escolas: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/2. Escolas rurais/1. Escolas/tic_educacao_2019_escolas_rurais_tabela_total_v1.0.xlsx',
      diretores: '../public/tic_educacao_2019/5. Tabelas de resultados/1. Português/2. Escolas rurais/2. Diretores e responsáveis/tic_educacao_2019_escolas_rurais_responsaveis_tabela_total_v1.0.xlsx',
    }
  }
}

app.get('/getAllData', (req, res) => {
  let object = {};
  let dataTest;
  for(let year in sheetsPaths){
    for(let path in sheetsPaths[year]){
      const school = sheetsPaths[year][path];
      const schoolType = path;
      for(let subPath in school){
        const data = convertToJson(school[subPath]);
        const categoryName = schoolType+capitalize(subPath);
        // dataTest = dataTreatment(data);
        
        dataTest = dataTreatment(data);
        object[categoryName] = dataTest;
      }
    }
  }
  res.send(object);
});

const convertToJson = (path) => {
  let wb = XLSX.readFile(path);
  let data;
  let object = {};
  for(const sheetName in wb.SheetNames){
    const wsname = wb.SheetNames[sheetName];
    const ws = wb.Sheets[wsname];
    data = XLSX.utils.sheet_to_json(ws);
    const tableKey = Object.keys(data[0]);
    const tableName = tableKey[0].split(' ')[4];
    object[tableName] = data;
  }
  return object;
}

const dataTreatment = (data) => {
  let treatedData = {};
  for(let table in data){
    let newData = {};
    let dataValues = Object.values(data[table])
    newData.title = Object.keys(dataValues[0])[0];
    newData.details = Object.values(dataValues[0])[0];

    newData = setCategory(Object.values(dataValues), newData);
    newData = setQuantity(Object.values(dataValues), newData);
    treatedData[table] = newData;
  }

  return treatedData;
}

const setCategory = (data, newData) => {
  let categories = {};
  categories = data[1];
  delete categories[newData.title];
  newData.categories = {
    positions: Object.keys(categories), //posição delas(nomes __EMPTY_1, etc)
    names: Object.values(categories),//nome das categorias
    subcategories: false,
  }
  // Em casos que possui subcategoria o valor no [2] ainda é string, mas em casos que não possui, já é os valores de total
  let subcategories = data[2];
  const subcatAnalisys = Object.values(subcategories)[1];
  if(isNaN(subcatAnalisys)){
    newData.subcategories = subcategories;
    newData.categories.subcategories = true;
  }
  return newData;
}

const setQuantity = (data, newData) => {
  const removeAccent = str => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
  }

  if(newData.title.includes('A1A')){
    console.log(newData);
  }

  const categories = newData.categories.names;
  const positions = newData.categories.positions;
  let subcategories;

  let iterator = 2;
  if(newData.categories.subcategories){
    iterator = 3;
    subcategories = newData.subcategories;
  }

  //TOTAL
  const majorIndicators = [
    'TOTAL',
    'SEXO',
    'RENDA FAMILIAR',
    'FAIXA ETÁRIA',
    'RENDA PESSOAL',
    'REGIÃO',
    'DEPENDÊNCIA ADMINISTRATIVA',
    'SÉRIE',
    'DISCIPLINA'
  ]
  
  let auxIndicator;
  let indicators = {};
  for(let i = iterator; i < data.length; i++){
    let indicator = Object.values(data[i])[0];
    let treatedData = data[i];

    if(i === data.length - 1){
      indicators.FONTE = indicator;
      break;
    }

    if(i === iterator){ //quantidade TOTAL
      delete treatedData[Object.keys(data[i])[0]];
      indicators[indicator] = {};
      
      if(newData.categories.subcategories) {
        let i = -1;
        for(let key in treatedData){
          if(treatedData[key] === '-'){
            treatedData[key] = 0;
          }

          if(positions.includes(key)){
            i++;
            indicators[indicator][categories[i]] = {};
          }
          
          indicators[indicator][categories[i]][subcategories[key]] = treatedData[key];
        }
      } else {
        let j = 0;
        for(let key in treatedData) {
          if(treatedData[key] === '-'){
            treatedData[key] = 0;
          }
          indicators[indicator][categories[j]] = treatedData[key];
          j++;
        }
      }
      // indicators[indicator] = treatedData;
    } else if(majorIndicators.indexOf(indicator) !== -1){ //demais tipos de indicadores, mas com algum major indicator
      auxIndicator = indicator;
      indicator = Object.values(data[i])[1];
      delete treatedData[Object.keys(data[i])[0]];
      delete treatedData[Object.keys(data[i+1])[0]];

      indicators[auxIndicator] = {};
      // indicators[auxIndicator][indicator] = treatedData;
      indicators[auxIndicator][indicator] = {};
      if(newData.categories.subcategories) {
        let i = -1;
        
        for(let key in subcategories){
          if(positions.includes(key)){
            i++;
            indicators[auxIndicator][indicator][categories[i]] = {};
          } 
          if(treatedData[key] === '-'){
            treatedData[key] = 0;
          }
          indicators[auxIndicator][indicator][categories[i]][subcategories[key]] = treatedData[key];

        }
      } else {
        for(let j = 0; j < positions.length; j++){
          if(treatedData[positions[j]] === '-'){
            treatedData[positions[j]] = 0;
          }
          indicators[auxIndicator][indicator][categories[j]] = treatedData[positions[j]];
        }
      }
      

    } else { //demais tipos de indicadores mas sem um major indicator
      delete treatedData[Object.keys(data[i])[0]];
      // indicators[auxIndicator][indicator] = treatedData;
      indicators[auxIndicator][indicator] = {};
      if(newData.categories.subcategories) {
        let i = -1;
        for(let key in subcategories){
          if(positions.includes(key)){
            i++;
            indicators[auxIndicator][indicator][categories[i]] = {};
          } 
          if(treatedData[key] === '-'){
            treatedData[key] = 0;
          }
          indicators[auxIndicator][indicator][categories[i]][subcategories[key]] = treatedData[key];

        }
      } else {
        for(let j = 0; j < positions.length; j++){
          if(treatedData[positions[j]] === '-'){
            treatedData[positions[j]] = 0;
          }
          indicators[auxIndicator][indicator][categories[j]] = treatedData[positions[j]];
        }
      }
    }
    
  }

  newData.indicators = indicators;
  return newData;
  
}

app.listen(5000, () => {
    console.log('server started on port 5000');
});