# API Professionalization Pack

| Asset               | Path                                                                             |
|---------------------|----------------------------------------------------------------------------------|
| OpenAPI snapshot    | [../docs/openapi.json](../docs/openapi.json)                                     |
| Postman collection  | [postman/ACTIRA.postman_collection.json](postman/ACTIRA.postman_collection.json) |
| Bruno collection    | [bruno/](bruno/)                                                                 |
| Insomnia            | [insomnia/ACTIRA.insomnia.json](insomnia/ACTIRA.insomnia.json)                   |
| Python SDK examples | [../examples/python/](../examples/python/)                                       |
| JavaScript examples | [../examples/javascript/](../examples/javascript/)                               |

Regenerate OpenAPI:

```bash
python backend/scripts/export_openapi.py -o docs/openapi.json
```
